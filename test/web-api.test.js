'use strict'

const t = require('tap')
const test = t.test
const Fastify = require('../fastify')
const fs = require('node:fs')
const semver = require('semver')
const { Readable } = require('node:stream')
const { fetch: undiciFetch } = require('undici')

if (semver.lt(process.versions.node, '18.0.0')) {
  t.skip('Response or ReadableStream not available, skipping test')
  process.exit(0)
}

test('should response with a ReadableStream', async (t) => {
  t.plan(2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(200).send(Readable.toWeb(stream))
  })

  const {
    statusCode,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.equal(statusCode, 200)
  t.equal(expected.toString(), body.toString())
})

test('should response with a Response', async (t) => {
  t.plan(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.equal(statusCode, 200)
  t.equal(expected.toString(), body.toString())
  t.equal(headers.hello, 'world')
})

test('able to use in onSend hook - ReadableStream', async (t) => {
  t.plan(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(500).send(Readable.toWeb(stream))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    t.equal(Object.prototype.toString.call(payload), '[object ReadableStream]')
    done(null, new Response(payload, {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.equal(statusCode, 200)
  t.equal(expected.toString(), body.toString())
  t.equal(headers.hello, 'world')
})

test('able to use in onSend hook - Response', async (t) => {
  t.plan(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 500,
      headers: {
        hello: 'world'
      }
    }))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    t.equal(Object.prototype.toString.call(payload), '[object Response]')
    done(null, new Response(payload.body, {
      status: 200,
      headers: payload.headers
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  t.equal(statusCode, 200)
  t.equal(expected.toString(), body.toString())
  t.equal(headers.hello, 'world')
})

test('Error when Response.bodyUsed', async (t) => {
  t.plan(4)

  const expected = await fs.promises.readFile(__filename)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = fs.createReadStream(__filename)
    const response = new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    })
    const file = await response.text()
    t.equal(expected.toString(), file)
    t.equal(response.bodyUsed, true)
    return reply.send(response)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.equal(response.statusCode, 500)
  const body = response.json()
  t.equal(body.code, 'FST_ERR_REP_RESPONSE_BODY_CONSUMED')
})

test('allow to pipe with fetch', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close.bind(fastify))

  fastify.get('/', function (request, reply) {
    return fetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET'
    })
  })

  fastify.get('/fetch', function (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.equal(response.statusCode, 200)
  t.same(response.json(), { ok: true })
})

test('allow to pipe with undici.fetch', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(fastify.close.bind(fastify))

  fastify.get('/', function (request, reply) {
    return undiciFetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET'
    })
  })

  fastify.get('/fetch', function (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  t.equal(response.statusCode, 200)
  t.same(response.json(), { ok: true })
})

test('WebStream should respect backpressure', async function (t) {
  t.plan(3)

  function delay (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms)
    })
  }

  const fastify = Fastify()
  t.teardown(fastify.close.bind(fastify))

  let drainEmittedAt = 0
  let secondWriteAt = 0
  let resolveSecondWrite
  const secondWrite = new Promise(function (resolve) {
    resolveSecondWrite = resolve
  })

  fastify.get('/', function (request, reply) {
    const raw = reply.raw
    const originalWrite = raw.write.bind(raw)
    const bufferedChunks = []
    let wroteFirstChunk = false

    raw.once('drain', function () {
      for (let i = 0; i < bufferedChunks.length; i++) {
        originalWrite(bufferedChunks[i])
      }
    })

    raw.write = function (chunk, encoding, cb) {
      if (!wroteFirstChunk) {
        wroteFirstChunk = true
        bufferedChunks.push(Buffer.from(chunk))
        delay(100).then(function () {
          drainEmittedAt = Date.now()
          raw.emit('drain')
        })
        if (typeof cb === 'function') {
          cb()
        }
        return false
      }
      if (!secondWriteAt) {
        secondWriteAt = Date.now()
        resolveSecondWrite()
      }
      return originalWrite(chunk, encoding, cb)
    }

    const stream = new ReadableStream({
      start: function (controller) {
        controller.enqueue(Buffer.from('chunk-1'))
      },
      pull: function (controller) {
        controller.enqueue(Buffer.from('chunk-2'))
        controller.close()
      }
    })

    reply.header('content-type', 'text/plain').send(stream)
  })

  await fastify.listen({ port: 0 })

  const response = await undiciFetch('http://localhost:' + fastify.server.address().port + '/')
  const bodyPromise = response.text()

  await secondWrite
  await delay(120)
  const body = await bodyPromise

  t.equal(response.status, 200)
  t.equal(body, 'chunk-1chunk-2')
  t.ok(secondWriteAt >= drainEmittedAt)
})
