# tribles-deno

![A three eyed trible in front of a round background showing space and the stars.](./trible.svg)

This is the deno implementation of the _tribles_ ecosystem.

It is still in early development.

## Status

So far the following components have been implemented.

- PART js implementation.
- TribleDB js immutable trible database.
- TribleKB js immutable trible knowledge-base.
- Core types:
  - UFOID
  - UUID
  - Shortstring
  - Longstring
  - Spacetimestamp
  - bigint256
  - float64

Currently to be done and missing is:

- PART rust implementation.
- TribleDB rust implementation.
- TribleMQ js middleware communications libary.
- JS Ontology tools to dynamically load TribleKB contexts and documentation from
  Trible based ontologies.
- Core number types.
- More types...
- Even more types...
- An ontology describing everything.

## Elevator Pitch

Many modern applications from chatbots and robots to project management
applications and wikis have the need for some form of flexible knowledge
represenation, that goes beyond the capabilities of traditional RDBMS. However
existing technologies like the Semantic Web with its RDF, SPARQL, jsonLD, and
OWL based standards are too complex, and transitively rely on further complexity
from other web standards. This results in few implementations, which are often
incomplete and infrequently maintained. However, the theoretical foundations and
ideas of these standards are often good and sound, what we need is "Semantic
Web, the good parts". What we need is the linked list of knowledge
representation. [1]

# Background and Fundamentals

## Triples and Tribles (and Blobs)

The fundamental building block of the _tribles_ ecosystem is the _trible_.
_Tribles_, are **b**inary _triples_, encoded as 64byte long immutable values,
that consists of three parts, an entity, an attribute, a value, or to use their
semantic web names, a subject, a predicate, and an object. Entity and attribute
are both 16byte wide, and hold a random or pseudorandom identifier like a UUID.
[2] The value is 32byte wide and can hold arbitrary data. Any data longer than
32byte is hashed with a function of the users choice, e.g. blake2s, and stored
as a blob. This separation of long and short data has a few advantages:

- It makes storing large binary data trivial.
- It allows for the system to eagerly share knowledge about this data, while
  being lazy about performing the actual transfer.
- It allows for interesting optimisations when indexing the now fixed size
  tribles.

The lengths of E,A, and V were chosen so that the frequency of collisions in IDs
or Hashes is far less likely than the system producing bad data from CPU errors.
Furthermore 64byte coincides nicely with the cache line size on most systems
(year 2020). [3]

## TribleDB and TribleKB

_Tribles_ are stored in TribleDB, a persistent (not in the durable, but
immutable sense), append only, in memory database. It provides conjunctive
queries and constraint solving over tribles, but is completely limited to binary
data.

Datalog like conjunctive queries are great if your language is build around
hypergraphs, e.g. Prolog. Alas most languages we use today are build around
trees, and therefore profit from languages that return trees or tree unfoldings
of graphs. A good example for this is GraphQL, although it is more of a RPC tool
than a query language. JSON-LD is another candidate, and while we found the
static conversions of JSON data to be cumbersome, we've adapted many concepts
from it.

_TribleDB_ is therefore wrapped by _TribleKB_, which performs conversions
between JS Objects and _trible_ data, provides tree interfaces for data
insertion, and tree based query capabilites, as well as tree-based graph walking
capabilites, all operating over familiar plain old javascript objects (and
proxies _cough_).

## Contexts, Types and Ontologies

The thing that JSON-LD realy got right, is their decoupling of the underlying
data representation (in their case RDF) and the user facing representation. If
different systems are to exchange information, or if a single system is
upgraded, there needs to be some form of neutral representation, in our case
bytes. By giving the user the ability to provide contexts in which the
underlying tribles can be interpreted as needed, we can:

- Provide easy upgrade paths for legacy systems. Old parts can read old
  representations, new parts can read new representations, or a mix thereof.
- Decouple programming language types from value types. E.g. a timestamp can be
  read as different date types in the same query.
- Allow the user to use approprate, self explanatory, names. One programmers
  legacy\_date is another programmers sanity\_check\_date.
- Allow users to fix past mistakes or missunderstandings. Whenever a name in OWL
  is used it's used. Trible don't care about names, only about IDs.

Typing has drawn heavy inspiration from RDFS, in that the type of a value (the
meaning of the layout of bytes, not the represenation in a programming language)
is only depending on the attribute itself. With one type per attribute id. This
has the advantage of giving statically typed programming languages like Rust the
ability to properly type queries with the help of statically generated contexts.

The above information is itself stored as _tribles_ in the form of an ontology.
You can think of it as a schema in an RDBMS, with the addition of it also
containing documentation and meta information.

- [1] Lispers will probably argue that the linked list is the linked list of
  knowledge representation.
- [2] Someone with an RDF background might recognize these as skolemized
  blank-nodes.
- [3] Unless maybe you're using a system with redundant CPUs, e.g. Rocket
  Control. In which case: "Why does your rocket need a knowledge base!!??"

# Examples:

Due to quick API iterations, the examples have become out of date. Take a look
at the tests instead.
