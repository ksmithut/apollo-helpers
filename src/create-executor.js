'use strict'

const { makeExecutableSchema } = require('graphql-tools')
const { execute, parse, subscribe } = require('graphql')
const { forAwaitEach } = require('iterall')
const compileGraphqlResources = require('./compile-graphql-resources')

/**
 * @function createExecutor
 * Creates a function that you can call which will execute a graphql query
 * without needing to setup apollo dev server or anything like that. Useful for
 * testing your graphql modules separate from each other.
 * @param {Object|Object[]} graphqlModule
 * @param {String} graphqlModule.schema - The graphql schema for this module
 * @param {Object} graphqlModule.resolvers - The resolvers for the types in the
 *   given schema
 * @param {Function} [graphqlModule.context] - A function that takes in a
 *   contextArg and should return an object that will be the "context" argument
 *   in the resolvers (the third argument in the resolver function)
 */
const createExecutor = graphqlModules => {
  const resources = compileGraphqlResources(graphqlModules)
  const schema = makeExecutableSchema({
    typeDefs: resources.typeDefs,
    resolvers: resources.resolvers
  })
  const getOptions = (query, graphqlOptions = {}) => {
    const context = Object.assign(
      {},
      graphqlOptions.contextValue,
      resources.getContext(graphqlOptions.contextArg)
    )
    return Object.assign({}, graphqlOptions, {
      schema,
      document: parse(query),
      contextValue: context
    })
  }

  /**
   * @typedef GraphqlOptions
   * @property {Object} contextArg - The argument that gets passed
   *   into your graphql module's `.context` handler
   * @property {any} rootValue - The root value to be the first
   *   argument in your top level query and mutation resolvers
   * @property {String} operationName - The name of the operation
   *   to run in your query
   * @property {Object} contextValue - Additional context to add
   *   that you need for your resolvers to run but your graphql module doesn't
   *   provide
   * @property {Object} variableValues - The variables to pass
   *   into your graphql query (if required)
   */

  /**
   * @function runQuery
   * @param {String} query - The graphql query to run
   * @param {GraphqlOptions} [graphqlOptions] - The graphql options to pass to the
   *   execute function
   */
  const runQuery = (query, graphqlOptions) => {
    const options = getOptions(query, graphqlOptions)
    return execute(options)
  }

  /**
   * @function runSubscribe
   * @param {String} query - The graphql query to subscribe to
   * @param {GraphqlOptions} [graphqlOptions] - The graphql options to pass to the
   *   execute function
   * @param {Function} callback - The function to be called when an event
   *   happens
   */
  const runSubscribe = (query, graphqlOptions, callback) => {
    const options = getOptions(query, graphqlOptions)
    return subscribe(options).then(iterator => forAwaitEach(iterator, callback))
  }

  return {
    run: runQuery,
    subscribe: runSubscribe
  }
}

module.exports = createExecutor
