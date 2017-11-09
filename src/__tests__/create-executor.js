/* eslint-env jest */
'use strict'

const { PubSub } = require('graphql-subscriptions')
const createExecutor = require('../create-executor')

describe('createExecutor', () => {
  test('runs a query', async () => {
    const executor = createExecutor({
      schema: `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: (rootValue, args, context) => {
            return 'Hello World'
          }
        }
      }
    })
    const query = `
      query {
        hello
      }
    `
    await expect(executor.run(query)).resolves.toEqual({
      data: {
        hello: 'Hello World'
      }
    })
  })

  test('runs with arguments', async () => {
    const testRootValue = { foo: 'bar' }
    const testContextArg = { hello: 'world' }
    const testContext = { another: 'variable' }
    const testAdditionalContext = { yet: 'another' }
    const testEcho = 'Hello to you, too'
    const additionalModule = {
      schema: `
        type Query { foo: String }
        type Mutation { foo: String }
        schema { query: Query, mutation: Mutation }
      `
    }
    const executor = createExecutor([
      {
        schema: `
          extend type Query {
            hello: String
          }
          extend type Mutation {
            echo(msg: String): String
          }
        `,
        context: arg => {
          expect(arg).toBe(testContextArg)
          return testContext
        },
        resolvers: {
          Query: {
            hello: (rootValue, args, context) => {
              expect(rootValue).toBe(testRootValue)
              expect(context).toEqual(
                Object.assign({}, testContext, testAdditionalContext)
              )
              return 'Hello World'
            }
          },
          Mutation: {
            echo: (rootValue, args, context) => {
              expect(rootValue).toBe(testRootValue)
              expect(args).toEqual({ msg: testEcho })
              expect(context).toEqual(
                Object.assign({}, testContext, testAdditionalContext)
              )
              return args.msg
            }
          }
        }
      },
      additionalModule
    ])
    const query = `
      query SayHello {
        hello
      }
      mutation SayHelloBack($message:String) {
        echo(msg: $message)
      }
    `
    await expect(
      executor.run(query, {
        rootValue: testRootValue,
        contextArg: testContextArg,
        operationName: 'SayHello',
        contextValue: testAdditionalContext
      })
    ).resolves.toEqual({
      data: {
        hello: 'Hello World'
      }
    })
    await expect(
      executor.run(query, {
        contextArg: testContextArg,
        rootValue: testRootValue,
        operationName: 'SayHelloBack',
        variableValues: { message: testEcho },
        contextValue: testAdditionalContext
      })
    ).resolves.toEqual({
      data: {
        echo: 'Hello to you, too'
      }
    })
  })

  test('works with subscriptions', done => {
    const pubsub = new PubSub()
    const executor = createExecutor({
      schema: `
        type Query {
          noop: String
        }
        type Subscription {
          thingChanged: String
        }
        schema {
          query: Query
          subscription: Subscription
        }
      `,
      resolvers: {
        Subscription: {
          thingChanged: {
            subscribe: () => pubsub.asyncIterator('thingChanged')
          }
        }
      }
    })
    const query = 'subscription { thingChanged }'
    executor.subscribe(query, undefined, value => {
      expect(value).toEqual({
        data: {
          thingChanged: 'Hello World'
        }
      })
      done()
    })
    pubsub.publish('thingChanged', { thingChanged: 'Hello World' })
  })
})
