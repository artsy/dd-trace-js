'use strict'

const agent = require('./agent')
const plugin = require('../../src/plugins/amqp10')

wrapIt()

describe('Plugin', () => {
  let tracer
  let client
  let receiver
  let sender
  let callbackPolicy

  describe('amqp10', () => {
    withVersions(plugin, 'amqp10', version => {
      beforeEach(() => {
        tracer = require('../..')
      })

      afterEach(() => {
        const promise = Promise.all([
          receiver && receiver.detach(),
          sender && sender.detach()
        ])

        return promise
          .then(() => {
            client.disconnect()
            agent.close()
            agent.wipe()
          })
      })

      describe('without configuration', () => {
        beforeEach(() => {
          return agent.load(plugin, 'amqp10')
            .then(() => {
              const amqp = require(`./versions/amqp10@${version}`).get()
              const None = amqp.Policy.Utils.SenderCallbackPolicies.None
              const OnSettle = amqp.Policy.Utils.SenderCallbackPolicies.OnSettle

              callbackPolicy = None || OnSettle

              client = new amqp.Client(amqp.Policy.merge({
                senderLink: {
                  callback: callbackPolicy
                }
              }))

              return client.connect('amqp://admin:admin@localhost:5673')
                .then(() => {
                  return Promise.all([
                    client.createReceiver('amq.topic'),
                    client.createSender('amq.topic')
                  ])
                })
                .then(handlers => {
                  receiver = handlers[0]
                  sender = handlers[1]
                })
            })
        })

        describe('when sending messages', () => {
          it('should do automatic instrumentation', done => {
            agent
              .use(traces => {
                const span = traces[0][0]

                expect(span).to.have.property('name', 'amqp.send')
                expect(span).to.have.property('service', 'test-amqp')
                expect(span).to.have.property('resource', 'send amq.topic')
                expect(span).to.have.property('type', 'worker')
                expect(span.meta).to.have.property('span.kind', 'producer')
                expect(span.meta).to.have.property('out.host', 'localhost')
                expect(span.meta).to.have.property('out.port', '5673')
                expect(span.meta).to.have.property('amqp.connection.host', 'localhost')
                expect(span.meta).to.have.property('amqp.connection.port', '5673')
                expect(span.meta).to.have.property('amqp.connection.user', 'admin')
                expect(span.meta).to.have.property('amqp.link.target.address', 'amq.topic')
                expect(span.meta).to.have.property('amqp.link.role', 'sender')
                expect(span.meta).to.have.property('amqp.link.handle', '1')
                expect(span.meta['amqp.link.name']).to.match(/^amq\.topic_[0-9a-f-]+$/)
              })
              .then(done)
              .catch(done)

            sender.send({ key: 'value' })
          })

          it('should handle errors', done => {
            let error

            agent
              .use(traces => {
                const span = traces[0][0]

                expect(span.error).to.equal(1)
                expect(span.meta).to.have.property('error.type', error.name)
                expect(span.meta).to.have.property('error.msg', error.message)
                expect(span.meta).to.have.property('error.stack', error.stack)
              })
              .then(done)
              .catch(done)

            if (callbackPolicy === 'none') {
              try {
                sender.send(() => {})
              } catch (e) {
                error = e
              }
            } else {
              sender.send(() => {}).catch(err => {
                error = err
              })
            }
          })
        })

        describe('when consuming messages', () => {
          it('should do automatic instrumentation', done => {
            agent
              .use(traces => {
                const span = traces[0][0]

                expect(span).to.have.property('name', 'amqp.receive')
                expect(span).to.have.property('service', 'test-amqp')
                expect(span).to.have.property('resource', 'receive amq.topic')
                expect(span).to.have.property('type', 'worker')
                expect(span.meta).to.have.property('span.kind', 'consumer')
                expect(span.meta).to.have.property('amqp.connection.host', 'localhost')
                expect(span.meta).to.have.property('amqp.connection.port', '5673')
                expect(span.meta).to.have.property('amqp.connection.user', 'admin')
                expect(span.meta).to.have.property('amqp.link.source.address', 'amq.topic')
                expect(span.meta).to.have.property('amqp.link.role', 'receiver')
                expect(span.meta).to.have.property('amqp.link.handle', '0')
                expect(span.meta['amqp.link.name']).to.match(/^amq\.topic_[0-9a-f-]+$/)
              })
              .then(done)
              .catch(done)

            sender.send({ key: 'value' })
          })

          it('should run the message event listener in the AMQP span scope', done => {
            if (process.env.DD_CONTEXT_PROPAGATION === 'false') return done()

            const parent = tracer.scopeManager().active()

            receiver.on('message', message => {
              const scope = tracer.scopeManager().active()

              expect(scope).to.not.equal(parent)

              done()
            })

            sender.send({ key: 'value' })
          })
        })
      })

      describe('with configuration', () => {
        beforeEach(() => {
          return agent.load(plugin, 'amqp10', { service: 'test' })
            .then(() => {
              const amqp = require(`./versions/amqp10@${version}`).get()

              client = new amqp.Client()

              return client.connect('amqp://admin:admin@localhost:5673')
                .then(() => {
                  return Promise.all([
                    client.createReceiver('amq.topic'),
                    client.createSender('amq.topic')
                  ])
                })
                .then(handlers => {
                  receiver = handlers[0]
                  sender = handlers[1]
                })
            })
        })

        it('should be configured with the correct values', done => {
          agent
            .use(traces => {
              const span = traces[0][0]

              expect(span).to.have.property('service', 'test')
            })
            .then(done)
            .catch(done)

          sender.send({ key: 'value' })
        })
      })
    })
  })
})
