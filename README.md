# apollo-helpers

A collection of functions I would rewrite over and over again the more I dealt
with Apollo graphql-tools, and other graphql setups.

# Installation

```sh
npm install apollo-helpers
```

# API

## `apolloHelpers.compileGraphqlResources(modules)`

This is used to combine an array of "graphql resources", each with their own
schema, resolvers, and context definitions, into a single set of properties
you can use to pass into { makeExecutableSchema } from 'graphql-tools'.

<details>
<summary>Example:</summary>

```js
const graphqlModules = [
  {
    schema: `type Query { health }`,
    resolvers: { Query: { health: () => 'ok' } }
  },
  {
    schema: `extend type Query { health2 }`,
    resolvers: {
      Query: {
        health2: (parent, args, context) => context.newHealth
      }
    },
    context: (req) => ({ newHealth: 'A-O-K' })
  }
]
const graphqlResources = compileGraphqlResources(graphqlModules)
const schema = makeExecutableSchema({
  typeDefs: graphqlResources.typeDefs,
  resolvers: graphqlResources.resolvers
})
app.use('/graphql', graphqlExpress((req) => ({
  schema,
  context: graphqlResources.getContext(req)
})))
```
</details>

The only argument is the array of graphql modules. Each of the graphql modules
can have the following properties:

- `module.schema` - A string, or a function that returns an array of strings
  which represent the schema (and dependent schemas) of your graphql module. See
  the [apollo docs](https://www.apollographql.com/docs/graphql-tools/generate-schema.html#modularizing)
  for how modularizing schemas works. Note that one of your modules will need to
  expose a `type Query {}` with something in it. An example graphql module will
  show you below.
- `module.resolvers` - An object, who's shape lines up with your schema. This
  object will be deeply merged into the rest of the resolvers for each of your
  modules. Each resolver function takes in three arguments: `parent` which is
  the object or value returned from the "parent" type (or the root value of your
  schema as might be the case), `args` which are the arguments that you've
  defined in your GraphQL Schema, and `context` which is the context of the
  query, which we'll look at in a minute.
- `module.context` - A function which takes in the `request` from whatever
  server framework you're using and should return an object, which will be
  merged together on every graphql request and passed as the `context` variable
  in your resolvers, allowing each graphql module to define it's own context.
  Note that every one of your "graphql module" contexts will be merged together
  regardless of which resolvers are being called, and merged in a shallow way
  (top level keys only, unlike resolvers).

The result of this function gives you an object which you can give to the
`graphql-tools` `makeExecutableSchema` and middleware function. The object will
be referred to as `graphqlResources`

- `graphqlResources.typeDefs` - The array of graphql type definiions needed to
  pass into `makeExecutableSchema`.
- `graphqlResources.resolvers` - An object containing the resolvers for your
  queries.
- `graphqlResources.getContext` - A function that you call with your server
  framework "request context" variable, and will return you the merged context
  object from all of your graphql modules.

<details>
<summary>Graphql Module example</summary>

```js
// resources/system/system.graphql.js
const systemController = {
  health: () => 'ok',
  echo: (msg) => msg
}

exports.schema = `
  type Query {
    health: String!
  }
  type Mutation {
    echo(msg: String!): String!
  }
`

exports.context = (req) => ({
  user: req.user || { id: null },
  system: systemController
})

exports.resolvers = {
  Query: {
    health (parent, args, context) {
      return context.system.health()
    }
  },
  Mutation: {
    echo (parent, args, context) {
      return context.system.echo(args.msg)
    }
  }
}
```

```js
// resources/todos/todos.graphql.js
// NOTE that in the examples, the business logic is happening in the resolvers.
// My personal opinion is that the logic should happen in the controller, and
// the resolvers should just call functions straight into the controller and
// just act as a translation layer.
const todoController = require('./todos.controller')

exports.schema = `
  type Todo {
    id: ID!
    label: String!
    completed: Boolean!
  }
  extend type Query {
    todos(completed: Boolean): [Todo]!
    todo(id: ID!): Todo
  }
  extend type Mutation {
    createTodo(label: String!): Todo
    updateTodo(
      id: ID!
      label: String
      completed: Boolean
    ): Todo
    deleteTodo(id: ID!): Todo
  }
`

exports.context = (req) => ({
  todos: todoController
})

exports.resolvers = {
  Todo: {
    id (parent) {
      return String(parent._id)
    }
  },
  Query: {
    todos (parent, args, context) {
      const query = Object.assign({}, args, { owner: context.user.id })
      return context.todos.find(query)
    },
    todo (parent, { id }, context) {
      return context.todos.findOne({
        _id: id,
        owner: context.user.id
      })
    }
  },
  Mutation: {
    createTodo (parent, { label }, context) {
      return context.todos.create({
        label,
        completed: false,
        owner: context.user.id
      })
    },
    updateTodo (parent, { id, ...update }, context) {
      return context.todos.findOneAndUpdate({
        _id: id,
        owner: context.user.id
      }, update, { new: true })
    },
    deleteTodo (parent, { id }, context) {
      return context.todos.findOneAndRemove({
        _id: id,
        owner: context.user.id
      })
    }
  }
}
```

```js
// app.js
const express = require('express')
const bodyParser = require('body-parser')
const { graphqlExpress } = require('apollo-server-express')
const { makeExecutableSchema } = require('graphq-tools')
const { compileGraphqlResources } = require('apollo-helpers')

// Resources
const system = require('./resources/system/system.graphql')
const todos = require('./resources/todos/todos.graphql')
const graphqlResources = compileGraphqlResources([
  system,
  todos
])

const schema = makeExecutableSchema({
  typeDefs: graphqlResources.typeDefs,
  resolvers: graphqlResources.resolvers
})

app.use(bodyParser.json())
app.use('/graphql', graphqlExpress((req) => ({
  schema,
  context: graphqlResources.getContext(req)
})))
```
</details>



## `apolloHelpers.createExecutor(graphqlModule)`

Creates a function that you can call which will execute a graphql query
without needing to setup apollo dev server or anything like that. Useful for
testing your graphql modules separate from each other.

- `graphqlModule` - This module follows the same shape/symantics of the graphql
  modules used in `compileGraphqlResources`, with a `schema`, `context`, and
  `resolvers` property. You can also pass in an array of modules if your module
  depends on another to work property.

Returns an object with a method you can call to run the query.

<details>
<summary>Example:</summary>

```js
const { createExecutor } = require('apollo-helpers')
const pubsub = new require('graphql-subscriptions').PubSub()

const graphqlModule = {
  schema: `
    Query { health: String! }
    Mutation { echo(msg: String!): String! }
    Subscription { tick: Int! }
  `,
  resolvers: {
    Query: {
      health: () => 'ok'
    },
    Mutation: {
      echo: (parent, args) => args.msg
    },
    Subscription: {
      tick: {
        subscribe: () => pubsub.asyncIterator('tick')
      }
    }
  }
}
setInterval(() => {
  pubsub.publish('tick', { tick: Date.now() })
}, 1000)

const executor = createExecutor(graphqlModule)

executor.run(`query { health }`)
  .then((result) => console.log(result)) // { data: { health: 'ok' } }

executor
  .run(`
    mutation Echo($message: String!) {
      echo(msg: $message)
    }
  `, {
    variableValues: { message: 'Hello world!' }
  })
  .then((result) => console.log(result)) // { data: { echo: 'Hello world!' } }

executor.subscribe(`subscription { tick }`, {}, (result) => {
  console.log(result) // { data: { tick: 1510239888797 }}
})
```
</details>

- `executor.run(query, graphqlOptions)`
  Runs the query and returns a promise which resolves with the data.
  - `query` - The graphql query to run
  - `graphqlOptions` - An object of object which help give more context to the
    query.
    - `graphqlOptions.contextArg` - The argument to pass to each of the
      `.context()` functions on each of the graphqlModules
    - `graphqlOptions.rootValue` - The parent object (first argument) to all of
      the top level query and mutation resolvers
    - `graphqlOptions.operationName` - If you have multiple operations defined
      in your `query`, you need to specify an operationName to tell the executor
      which query to run
    - `graphqlOptions.contextValue` - Additional context to pass into the
      `context` argument
    - `graphqlOptions.variableValues` - Variables to pass into the graphqlQuery

- `executor.subscribe(query, graphqlOptions, callback)`
  Subscribes to a given subscription and calls the callback when that query
  publishes an event.
