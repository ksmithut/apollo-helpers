/* eslint-env jest */
'use strict'

const apolloHelpers = require('../index')

describe('apolloHelpers', () => {
  test('should have methods', () => {
    expect(apolloHelpers).toMatchSnapshot()
  })
})
