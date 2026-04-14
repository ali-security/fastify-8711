'use strict'

/**
 * keyValuePairsReg is used to split the parameters list into associated
 * key value pairings.
 *
 * @see https://httpwg.org/specs/rfc9110.html#parameter
 * @type {RegExp}
 */
var keyValuePairsReg = /([\w!#$%&'*+.^`|~-]+)=([^;]*)/gm

/**
 * typeNameReg is used to validate that the first part of the media-type
 * does not use disallowed characters.
 *
 * @see https://httpwg.org/specs/rfc9110.html#rule.token.separators
 * @type {RegExp}
 */
var typeNameReg = /^[\w!#$%&'*+.^`|~-]+$/

/**
 * subtypeNameReg is used to validate that the second part of the media-type
 * does not use disallowed characters.
 *
 * @see https://httpwg.org/specs/rfc9110.html#rule.token.separators
 * @type {RegExp}
 */
var subtypeNameReg = /^[\w!#$%&'*+.^`|~-]+\s*/

/**
 * ContentType parses and represents the value of the content-type header.
 *
 * @see https://httpwg.org/specs/rfc9110.html#media.type
 * @see https://httpwg.org/specs/rfc9110.html#parameter
 */
class ContentType {
  #valid = false
  #empty = true
  #type = ''
  #subtype = ''
  #parameters = new Map()
  #string

  constructor (headerValue) {
    if (headerValue == null || headerValue === '' || headerValue === 'undefined') {
      return
    }

    var sepIdx = headerValue.indexOf(';')
    if (sepIdx === -1) {
      // The value is the simplest `type/subtype` variant.
      sepIdx = headerValue.indexOf('/')
      if (sepIdx === -1) {
        // Got a string without the correct `type/subtype` format.
        return
      }

      var type = headerValue.slice(0, sepIdx).trimStart().toLowerCase()
      var subtype = headerValue.slice(sepIdx + 1).trimEnd().toLowerCase()

      if (
        typeNameReg.test(type) === true &&
        subtypeNameReg.test(subtype) === true
      ) {
        this.#valid = true
        this.#empty = false
        this.#type = type
        this.#subtype = subtype
      }

      return
    }

    // We have a `type/subtype; params=list...` header value.
    var mediaType = headerValue.slice(0, sepIdx).toLowerCase()
    var paramsList = headerValue.slice(sepIdx + 1).trim()

    sepIdx = mediaType.indexOf('/')
    if (sepIdx === -1) {
      // We got an invalid string like `something; params=list...`.
      return
    }
    var type = mediaType.slice(0, sepIdx).trimStart()
    var subtype = mediaType.slice(sepIdx + 1).trimEnd()

    if (
      typeNameReg.test(type) === false ||
      subtypeNameReg.test(subtype) === false
    ) {
      // Some portion of the media-type is using invalid characters. Therefore,
      // the content-type header is invalid.
      return
    }
    this.#type = type
    this.#subtype = subtype
    this.#valid = true
    this.#empty = false

    var matches = keyValuePairsReg.exec(paramsList)
    while (matches) {
      var key = matches[1]
      var value = matches[2]
      if (value[0] === '"') {
        if (value[value.length - 1] !== '"') {
          this.#parameters.set(key, 'invalid quoted string')
          matches = keyValuePairsReg.exec(paramsList)
          continue
        }
        this.#parameters.set(key, value.slice(1, value.length - 1))
      } else {
        this.#parameters.set(key, value)
      }
      matches = keyValuePairsReg.exec(paramsList)
    }
  }

  get [Symbol.toStringTag] () { return 'ContentType' }

  get isEmpty () { return this.#empty }

  get isValid () { return this.#valid }

  get mediaType () { return this.#type + '/' + this.#subtype }

  get type () { return this.#type }

  get subtype () { return this.#subtype }

  get parameters () { return this.#parameters }

  toString () {
    /* c8 ignore next: we don't need to verify the cache */
    if (this.#string) return this.#string
    var parameters = []
    for (var [key, value] of this.#parameters.entries()) {
      parameters.push(`${key}="${value}"`)
    }
    var result = [this.#type, '/', this.#subtype]
    if (parameters.length > 0) {
      result.push('; ')
      result.push(parameters.join('; '))
    }
    this.#string = result.join('')
    return this.#string
  }
}

module.exports = ContentType
