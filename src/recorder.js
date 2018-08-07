'use strict'

const Scheduler = require('./scheduler')
const Writer = require('./writer')

// TODO: make calls to Writer#append asynchronous

class Recorder {
  constructor (url, interval, size, afterFlush) {
    this._writer = new Writer(url, size, afterFlush)

    if (interval > 0) {
      this._scheduler = new Scheduler(() => this._writer.flush(), interval)
      // TODO always make an initial call to fetch rates asap
      // this._writer.flush()
    }
  }

  init () {
    this._scheduler && this._scheduler.start()
  }

  record (span) {
    this._writer.append(span)

    if (!this._scheduler) {
      this._writer.flush()
    }
  }
}

module.exports = Recorder
