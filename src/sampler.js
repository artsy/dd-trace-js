'use strict'

const DEFAULT_KEY = 'service:,env:'
class Sampler {
  constructor (rate) {
    this._rate = rate
  }

  isSampled (span) {
    return this._rate === 1 || Math.random() < this._rate
  }

  updateRate (rate) {
    console.log(rate)
    this._rate = rate
  }
}

module.exports = Sampler
