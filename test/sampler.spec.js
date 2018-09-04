'use strict'

const Span = require('../src/opentracing/span')
const { RateSampler, RateByServiceSampler } = require('../src/sampler')

describe('Sampler', () => {
  beforeEach(() => {
    sinon.stub(Math, 'random')
  })

  afterEach(() => {
    Math.random.restore()
  })

  describe('RateSampler', () => {
    let span

    beforeEach(() => {
      span = _spanForService('any')
    })

    describe('isSampled', () => {
      it('should always sample when rate is 1', () => {
        const sampler = new RateSampler(1, 'test')

        Math.random.returns(0.9999999999999999)

        expect(sampler.isSampled(span)).to.be.true
      })

      it('should never sample when rate is 0', () => {
        const sampler = new RateSampler(0, 'test')

        Math.random.returns(0)

        expect(sampler.isSampled(span)).to.be.false
      })

      it('should sample according to the rate', () => {
        const sampler = new RateSampler(0.1234, 'test')

        Math.random.returns(0.1233999999999999)

        expect(sampler.isSampled(span)).to.be.true

        Math.random.returns(0.1234)

        expect(sampler.isSampled(span)).to.be.false
      })
    })

    describe('RateByServiceSampler', () => {
      it('should update by service and env', () => {
        const sampler = new RateByServiceSampler(1, 'staging')
        sampler.updateRateByService({
          'service:a,env:staging': 1,
          'service:a,env:production': 0,
          'service:b,env:staging': 0,
          'service:b,env:production': 1
        })
        expect(sampler.isSampled(_spanForService('a'))).to.be.true
        expect(sampler.isSampled(_spanForService('b'))).to.be.false
      })

      it('should remove services not in the payload from the agent any longer and falls back to default value', () => {
        const fallback = 0.9
        const sampler = new RateByServiceSampler(fallback, 'staging')
        sampler.updateRateByService({
          'service:a,env:staging': 0.42
        })
        sampler.updateRateByService({})
        expect(sampler._samplerForSpan(_spanForService('a'))._rate).to.equal(0.9)
      })

      it('should not fall back to default value when rate is 0', () => {
        const sampler = new RateByServiceSampler(1, 'staging')
        sampler.updateRateByService({
          'service:a,env:staging': 0
        })
        expect(sampler._samplerForSpan(_spanForService('a'))._rate).to.equal(0)
      })
    })
  })
  
  describe('PrioritySampler', () => {
    it('')
  })

  function _spanForService (service) {
    const tracer = sinon.stub({ _isSampled: () => false })
    return new Span(tracer, { tags: { 'service.name': service } })
  }
})
