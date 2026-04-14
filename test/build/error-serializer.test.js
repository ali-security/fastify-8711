'use strict'

const t = require('tap')
const test = t.test
const fs = require('node:fs')
const path = require('node:path')

const { code } = require('../../build/build-error-serializer')

function unifyLineBreak (str) {
  return str.toString().replace(/\r\n/g, '\n')
}

const isPrepublish = !!process.env.PREPUBLISH

test('ensure the current error serializer is latest', { skip: !isPrepublish }, async (t) => {
  t.plan(1)

  const current = await fs.promises.readFile(path.resolve('lib/error-serializer.js'))

  // line break should not be a problem depends on system
  t.equal(unifyLineBreak(current), unifyLineBreak(code))
})
