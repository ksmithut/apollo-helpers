/* eslint-env jest */
'use strict'

const compileGraphqlResources = require('../compile-graphql-resources')

describe('compileGraphqlResources', () => {
  test('compiles the resources', () => {
    const graphqlModules = [
      {
        schema: 'type Query { health }',
        resolvers: { Query: { health: () => 'ok' } }
      },
      {
        schema: 'extend type Query { health2 }',
        resolvers: {
          Query: {
            health2: (obj, args, ctx) => ctx.newHealth
          }
        },
        context: req => ({ newHealth: 'A-O-K' })
      }
    ]
    const graphqlResources = compileGraphqlResources(graphqlModules)
    expect(graphqlResources.typeDefs).toEqual([
      'type Query { health }',
      'extend type Query { health2 }'
    ])
    expect(graphqlResources.resolvers).toMatchObject({
      Query: {
        health: expect.any(Function),
        health2: expect.any(Function)
      }
    })
    expect(graphqlResources.getContext()).toEqual({
      newHealth: 'A-O-K'
    })
    expect(graphqlResources.getContext({})).toEqual({
      newHealth: 'A-O-K'
    })
  })
})
