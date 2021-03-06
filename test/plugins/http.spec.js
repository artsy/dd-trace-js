'use strict'

const getPort = require('get-port')
const agent = require('./agent')
const semver = require('semver')

wrapIt()

describe('Plugin', () => {
  let plugin
  let express
  let http
  let appListener
  let tracer
  let pems

  ['http', 'https'].forEach(protocol => {
    describe(protocol, () => {
      function server (app, port, listener) {
        let server
        if (protocol === 'https') {
          if (!pems) {
            // Generate self-signed cert
            pems = require('selfsigned').generate([{ name: 'commonName', value: 'datadoghq.com' }], { days: 365 })
            // We're fine with self-signed certs for this test
            process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
          }
          server = require('https').createServer({ key: pems.private, cert: pems.cert }, app)
        } else {
          server = require('http').createServer(app)
        }
        server.listen(port, 'localhost', listener)
        return server
      }

      beforeEach(() => {
        plugin = require('../../src/plugins/http')
        tracer = require('../..')
        appListener = null
      })

      afterEach(() => {
        if (appListener) {
          appListener.close()
        }
        return agent.close()
      })

      describe('without configuration', () => {
        beforeEach(() => {
          return agent.load(plugin, 'http')
            .then(() => {
              http = require(protocol)
              express = require('express')
            })
        })

        it('should do automatic instrumentation', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0]).to.have.property('service', 'test-http-client')
                expect(traces[0][0]).to.have.property('type', 'web')
                expect(traces[0][0]).to.have.property('resource', 'GET')
                expect(traces[0][0].meta).to.have.property('span.kind', 'client')
                expect(traces[0][0].meta).to.have.property('http.url', `${protocol}://localhost:${port}/user`)
                expect(traces[0][0].meta).to.have.property('http.method', 'GET')
                expect(traces[0][0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
              })

              req.end()
            })
          })
        })

        it(`should also support get()`, done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0]).to.not.be.undefined
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.get(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
              })

              req.end()
            })
          })
        })

        it('should support configuration as an URL object', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0].meta).to.have.property('http.url', `${protocol}://localhost:${port}/user`)
              })
              .then(done)
              .catch(done)

            const uri = {
              protocol: `${protocol}:`,
              hostname: 'localhost',
              port,
              pathname: '/user'
            }

            appListener = server(app, port, () => {
              const req = http.request(uri)

              req.end()
            })
          })
        })

        if (semver.satisfies(process.version, '>=10')) {
          it('should support a string URL and an options object, which merges and takes precedence', done => {
            const app = express()

            app.get('/user', (req, res) => {
              res.status(200).send()
            })

            getPort().then(port => {
              agent
                .use(traces => {
                  expect(traces[0][0].meta).to.have.property('http.url', `${protocol}://localhost:${port}/user`)
                })
                .then(done)
                .catch(done)

              appListener = server(app, port, () => {
                const req = http.request(`${protocol}://localhost:${port}/another-path`, { path: '/user' })

                req.end()
              })
            })
          })

          it('should support a URL object and an options object, which merges and takes precedence', done => {
            const app = express()

            app.get('/user', (req, res) => {
              res.status(200).send()
            })

            getPort().then(port => {
              agent
                .use(traces => {
                  expect(traces[0][0].meta).to.have.property('http.url', `${protocol}://localhost:${port}/user`)
                })
                .then(done)
                .catch(done)

              const uri = {
                protocol: `${protocol}:`,
                hostname: 'localhost',
                port,
                pathname: '/another-path'
              }

              appListener = server(app, port, () => {
                const req = http.request(uri, { path: '/user' })

                req.end()
              })
            })
          })
        }

        it('should use the correct defaults when not specified', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0].meta).to.have.property('http.url', `${protocol}://localhost:${port}/`)
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request({
                protocol: `${protocol}:`,
                port
              })

              req.end()
            })
          })
        })

        it('should not require consuming the data', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0]).to.not.be.undefined
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`)

              req.end()
            })
          })
        })

        it('should wait for other listeners before resuming the response stream', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send('OK')
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                setTimeout(() => {
                  res.on('data', () => done())
                })
              })

              req.end()
            })
          })
        })

        it('should inject its parent span in the headers', done => {
          const app = express()

          app.get('/user', (req, res) => {
            expect(req.get('x-datadog-trace-id')).to.be.a('string')
            expect(req.get('x-datadog-parent-id')).to.be.a('string')

            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0].meta).to.have.property('http.status_code', '200')
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`)

              req.end()
            })
          })
        })

        it('should skip injecting if the Authorization header contains an AWS signature', done => {
          const app = express()

          app.get('/', (req, res) => {
            try {
              expect(req.get('x-datadog-trace-id')).to.be.undefined
              expect(req.get('x-datadog-parent-id')).to.be.undefined

              res.status(200).send()

              done()
            } catch (e) {
              done(e)
            }
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request({
                port,
                headers: {
                  Authorization: 'AWS4-HMAC-SHA256 ...'
                }
              })

              req.end()
            })
          })
        })

        it('should skip injecting if one of the Authorization headers contains an AWS signature', done => {
          const app = express()

          app.get('/', (req, res) => {
            try {
              expect(req.get('x-datadog-trace-id')).to.be.undefined
              expect(req.get('x-datadog-parent-id')).to.be.undefined

              res.status(200).send()

              done()
            } catch (e) {
              done(e)
            }
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request({
                port,
                headers: {
                  Authorization: ['AWS4-HMAC-SHA256 ...']
                }
              })

              req.end()
            })
          })
        })

        it('should skip injecting if the X-Amz-Signature header is set', done => {
          const app = express()

          app.get('/', (req, res) => {
            try {
              expect(req.get('x-datadog-trace-id')).to.be.undefined
              expect(req.get('x-datadog-parent-id')).to.be.undefined

              res.status(200).send()

              done()
            } catch (e) {
              done(e)
            }
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request({
                port,
                headers: {
                  'X-Amz-Signature': 'abc123'
                }
              })

              req.end()
            })
          })
        })

        it('should skip injecting if the X-Amz-Signature query param is set', done => {
          const app = express()

          app.get('/', (req, res) => {
            try {
              expect(req.get('x-datadog-trace-id')).to.be.undefined
              expect(req.get('x-datadog-parent-id')).to.be.undefined

              res.status(200).send()

              done()
            } catch (e) {
              done(e)
            }
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request({
                port,
                path: '/?X-Amz-Signature=abc123'
              })

              req.end()
            })
          })
        })

        it('should run the callback in the parent context', done => {
          if (process.env.DD_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send('OK')
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                expect(tracer.scopeManager().active()).to.be.null
                done()
              })

              req.end()
            })
          })
        })

        it('should run the event listeners in the parent context', done => {
          if (process.env.DD_CONTEXT_PROPAGATION === 'false') return done()

          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send('OK')
          })

          getPort().then(port => {
            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
                res.on('end', () => {
                  expect(tracer.scopeManager().active()).to.be.null
                  done()
                })
              })

              req.end()
            })
          })
        })

        it('should handle errors', done => {
          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0].meta).to.have.property('error.type', 'Error')
                expect(traces[0][0].meta).to.have.property('error.msg', `connect ECONNREFUSED 127.0.0.1:${port}`)
                expect(traces[0][0].meta).to.have.property('error.stack')
              })
              .then(done)
              .catch(done)

            const req = http.request(`${protocol}://localhost:${port}/user`)

            req.end()
          })
        })

        it('should only record a request once', done => {
          // Make sure both plugins are loaded, which could cause double-counting.
          require('http')
          require('https')

          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = traces[0]
                // 1 parent span created in this test, 2 spans for first request, 2 spans for second request.
                expect(spans.length).to.equal(5)
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              // Activate a new parent span so we capture any double counting that may happen, otherwise double-counts
              // would be siblings and our test would only capture 1 as a false positive.
              const span = tracer.startSpan('http-test')
              tracer.scopeManager().activate(span)

              // Test `http(s).request
              const req = http.request(`${protocol}://localhost:${port}/user?test=request`, res => {
                res.on('data', () => {})
              })
              req.end()

              // Test `http(s).get`
              http.get(`${protocol}://localhost:${port}/user?test=get`, res => {
                res.on('data', () => {})
              })

              span.finish()
            })
          })
        })

        it('should trace connection establishment', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = traces[0]
                const request = spans[0]
                const connect = spans[1]
                expect(connect).to.have.property('service', 'test-http-client')
                expect(connect).to.have.property('resource', 'http.request.connect')
                expect(connect.parent_id.toString()).to.equal(request.span_id.toString())
                expect(connect.start.toNumber()).to.be.gte(request.start.toNumber())
                expect(connect.duration.toNumber()).to.be.lte(request.duration.toNumber())
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
              })

              req.end()
            })
          })
        })

        it('should not include connection establishment spans for keep-alive connections', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                const spans = traces.reduce((arr, spans) => arr.concat(spans), [])
                // 1 parent span created in this test, 2 spans for first request, 1 span for second request.
                expect(spans.length).to.equal(4)
              }, 10)
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              // Activate a new parent span so we capture both these requests.
              const span = tracer.startSpan('http-test')
              tracer.scopeManager().activate(span)

              const options = {
                agent: new http.Agent({ keepAlive: true }),
                protocol: `${protocol}:`,
                hostname: 'localhost',
                port,
                pathname: '/user'
              }
              // First make request that will keep connection alive...
              http.get(options, res => {
                res.on('data', () => {})
                res.on('end', () => {
                  setImmediate(() => {
                    // ...once finished start second request that should re-use connection.
                    http.get(options, res => {
                      res.on('data', () => {})
                      res.on('end', () => setImmediate(() => span.finish()))
                    })
                  })
                })
              })
            })
          })
        })
      })

      describe('with service configuration', () => {
        let config

        beforeEach(() => {
          config = {
            service: 'custom'
          }

          return agent.load(plugin, 'http', config)
            .then(() => {
              http = require(protocol)
              express = require('express')
            })
        })

        it('should be configured with the correct values', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0]).to.have.property('service', 'custom')
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
              })

              req.end()
            })
          })
        })
      })

      describe('with splitByDomain configuration', () => {
        let config

        beforeEach(() => {
          config = {
            splitByDomain: true
          }

          return agent.load(plugin, 'http', config)
            .then(() => {
              http = require(protocol)
              express = require('express')
            })
        })

        it('should use the remote endpoint as the service name', done => {
          const app = express()

          app.get('/user', (req, res) => {
            res.status(200).send()
          })

          getPort().then(port => {
            agent
              .use(traces => {
                expect(traces[0][0]).to.have.property('service', `localhost:${port}`)
              })
              .then(done)
              .catch(done)

            appListener = server(app, port, () => {
              const req = http.request(`${protocol}://localhost:${port}/user`, res => {
                res.on('data', () => {})
              })

              req.end()
            })
          })
        })
      })
    })
  })
})
