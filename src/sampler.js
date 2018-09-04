'use strict'

const DEFAULT_KEY = 'service:,env:'

class Sampler {
  isSampled (span) {
    throw new Error('samplers have to implement the isSampled() method')
  }
}

class RateSampler extends Sampler {
  constructor (rate) {
    super()
    this._rate = rate
  }

  isSampled (_span) {
    return this._rate === 1 || Math.random() < this._rate
  }

  set rate (rate) {
    this._rate = rate
  }
}

class RateByServiceSampler extends Sampler {
  constructor (rate, env) {
    super()
    this._env = env
    this._samplerByService = { [DEFAULT_KEY]: new RateSampler(rate) }
  }

  isSampled (span) {
    return this._samplerForSpan(span).isSampled(span)
  }

  updateRateByService (rateByService) {
    const samplerByService = { [DEFAULT_KEY]: this._samplerByService[DEFAULT_KEY] }
    for (const key in rateByService) {
      const rate = rateByService[key]
      let sampler = this._samplerByService[key]
      if (sampler) {
        sampler.rate = rate
      } else {
        sampler = new RateSampler(rate)
      }
      samplerByService[key] = sampler
    }
    this._samplerByService = samplerByService
  }

  _samplerForSpan (span) {
    const sampler = this._samplerByService[this._keyForSpan(span)]
    if (sampler === undefined) {
      return this._samplerByService[DEFAULT_KEY]
    }
    return sampler
  }

  _keyForSpan (span) {
    return `service:${span.service},env:${this._env}`
  }
}

module.exports = {
  Sampler,
  RateSampler,
  RateByServiceSampler
}
