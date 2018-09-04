'use strict'

const agent = require('./plugins/agent')

describe('Recorder', () => {
  let Scheduler
  let scheduler
  let Recorder
  let Writer
  let writer
  let recorder
  let span

  beforeEach(() => {
    span = {}
    scheduler = {
      start: sinon.spy(),
      reset: sinon.spy()
    }
    writer = {
      append: sinon.spy(),
      flush: sinon.spy()
    }
    Scheduler = sinon.stub().returns(scheduler)
    Writer = sinon.stub().returns(writer)
    Recorder = proxyquire('../src/recorder', {
      './scheduler': Scheduler,
      './writer': Writer
    })
  })

  describe('in general', () => {
    it('should configure the writer with the afterFlush callback', () => {
      const callback = sinon.stub()
      recorder = new Recorder('http://test', 1000, 2, callback)
      expect(Writer.firstCall.lastArg).to.equal(callback)
    })
  })

  describe('when interval is set to a positive number', () => {
    beforeEach(() => {
      recorder = new Recorder('http://test', 1000, 2)
    })

    describe('init', () => {
      it('should schedule flushing after the configured interval', () => {
        writer.length = 0

        recorder.init()
        Scheduler.firstCall.args[0]()

        expect(scheduler.start).to.have.been.called
        expect(writer.flush).to.have.been.called
      })
    })

    describe('record', () => {
      beforeEach(() => {
        span = {}
      })

      it('should record a span', () => {
        writer.length = 0
        recorder.record(span)

        expect(writer.append).to.have.been.calledWith(span)
      })
    })
  })

  describe('when interval is set to 0', () => {
    let yieldedResponse

    beforeEach(() => {
      yieldedResponse = null
      recorder = new Recorder('http://test', 0, 2, res => { yieldedResponse = res })
    })

    describe('init', () => {
      it('should not schedule flushing', () => {
        writer.length = 0

        recorder.init()

        expect(scheduler.start).to.not.have.been.called
      })
    })

    it('should flush right away when interval is set to 0', () => {
      recorder.record(span)

      expect(writer.flush).to.have.been.called
    })
  })
})
