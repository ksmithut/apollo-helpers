'use strict'

const R = require('ramda')

const arrify = R.ifElse(R.is(Array), R.identity, R.of)

/**
 * @typedef {Object} GraphqlResources
 * @property {Array} typeDefs - The typeDefs to be passed into
 *   makeExecutableSchema
 * @property {Object} resolvers - The resolvers object to be passed into
 *   makeExecutableSchema
 * @property {Function} getContext - A function that takes in the request
 *   context, and returns a merged object from all of the modules. Should be
 *   used in the `context` option in the graphql request handler.
 */

/**
 * @function compileGraphqlResources
 * This is used to combine an array of "graphql resources", each with their own
 * schema, resolvers, and context definitions, into a single set of properties
 * you can use to pass into { makeExecutableSchema } from 'graphql-tools'.
 * @example
 *     const graphqlModules = [
 *       {
 *         schema: `type Query { health }`,
 *         resolvers: { Query: { health: () => 'ok' } }
 *       },
 *       {
 *         schema: `extend type Query { health2 }`,
 *         resolvers: {
 *           Query: {
 *             health2: (obj, args, ctx) => ctx.newHealth
 *           }
 *         },
 *         context: (req) => ({ newHealth: 'A-O-K' })
 *       }
 *     ]
 *     const graphqlResources = compileGraphqlResources(graphqlModules)
 *     const schema = makeExecutableSchema({
 *       typeDefs: graphqlResources.typeDefs,
 *       resolvers: graphqlResources.resolvers
 *     })
 *     app.use('/graphql', graphqlExpress((req) => ({
 *       schema,
 *       context: graphqlResources.getContext(req)
 *     })))
 * @param {Object[]} modules - The graphql modules to combine
 * @param {String} [modules[].schema] - The GraphQL schema to merge
 *   into the root schema
 * @param {Object} [modules[].resolvers] - The GraphQL resolvers for the given
 *   schema
 * @param {Function} [modules[].context] - A function that gets called with the
 *   request context (`req` in express), and should return an object which will
 *   be merged together with all of the other module's `context()` results, and
 *   will be passed as the third argument in your resolvers.
 * @return {GraphqlResources}
 */
const compileGraphqlResources = modules => {
  const getResources = R.applySpec({
    // Gets the array of all of the type defs from each graphql module
    typeDefs: R.pipe(R.pluck('schema'), R.reject(R.isNil)),
    // Deep merge all of the resolvers
    resolvers: R.pipe(
      R.pluck('resolvers'),
      R.reject(R.isNil),
      R.reduce(R.mergeDeepRight, {})
    ),
    // A function that takes in an object, and calls all of the `.context()`
    // functions of each graphql module with that object, and returns an array of
    // the results.
    getContexts: R.pipe(R.pluck('context'), R.reject(R.isNil), R.juxt)
  })

  const resources = R.pipe(arrify, getResources)(modules)

  return {
    typeDefs: resources.typeDefs,
    resolvers: resources.resolvers,
    getContext: req => {
      return R.mergeAll(resources.getContexts(req))
    }
  }
}

module.exports = compileGraphqlResources
