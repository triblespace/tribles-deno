# tribles-deno

![A three eyed trible in front of a round background showing space and the stars.](./trible.svg)

This is the deno implementation of the _tribles_ ecosystem.

It is still in early development.

## Status

So far the following components have been implemented.

- PACT js implementation.
- TribleSet js immutable trible database.
- BlobCache js immutable trible database.
- KB js immutable trible knowledge-base.
- MQ js middleware communications libary.
- Core types:
  - UFOID
  - UUID
  - Shortstring
  - Longstring
  - Spacetimestamp
  - bigint256
  - float64

Currently to be done and missing is:

- PACT rust implementation.
- tribleset rust implementation.
- More rust...
- JS Ontology tools to dynamically load KnowlegeBase namespaces and
  documentation from Trible based ontologies.
- Core number types.
- More types...
- Even more types...
- An ontology describing everything.

## Elevator Pitch

Many modern applications from chatbots and robots to project management
applications and wikis have the need for some form of flexible knowledge
representation, that goes beyond the capabilities of traditional RDBMS. However
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

## TribleSet and KB

_Tribles_ are stored in TribleSets, a persistent (not in the durable, but
immutable sense), append only, in memory databases. It provides conjunctive
queries and constraint solving over tribles, but is completely limited to binary
data.

Datalog like conjunctive queries are great if your language is built around
hypergraphs, e.g. Prolog. Alas most languages we use today are build around
trees, and therefore profit from languages that return trees or tree unfoldings
of graphs. A good example for this is GraphQL, although it is more of a RPC tool
than a query language. JSON-LD is another candidate, and while we found the
static conversions of JSON data to be cumbersome, we've adapted many concepts
from it.

_TribleSet_ is therefore wrapped by _KB_, which performs conversions between JS
Objects and _trible_ data, provides tree interfaces for data insertion, and tree
based query capabilites, as well as tree-based graph walking capabilities, all
operating over familiar plain old javascript objects (and proxies _cough_).

## Namespaces, Types and Ontologies

The thing that JSON-LD really got right, is their decoupling of the underlying
data representation (in their case RDF) and the user facing representation. If
different systems are to exchange information, or if a single system is
upgraded, there needs to be some form of neutral representation, in our case
bytes. By giving the user the ability to provide namespaces in which the
underlying tribles can be interpreted as needed, we can:

- Provide easy upgrade paths for legacy systems. Old parts can read old
  representations, new parts can read new representations, or a mix thereof.
- Decouple programming language types from value types. E.g. a timestamp can be
  read as different date types in the same query.
- Allow the user to use appropriate, self explanatory, names. One programmers
  legacy_date is another programmers sanity_check_date.
- Allow users to fix past mistakes or misunderstandings. Whenever a name in OWL
  is used it's used up. Trible don't care about names, only about binary IDs.

Typing has drawn heavy inspiration from RDFS, in that the type of a value (the
meaning of the layout of bytes, not the representation in a programming
language) is only depending on the attribute itself. With one type per attribute
id. This has the advantage of giving statically typed programming languages like
Rust the ability to properly type queries with the help of statically generated
namespaces.

The above information is itself stored as _tribles_ in the form of an ontology.
You can think of it as a schema in an RDBMS, with the addition of it also
containing documentation and meta information.

- [1] Lispers will probably argue that the linked list is the linked list of
  knowledge representation.
- [2] Someone with an RDF background might recognize these as skolemized
  blank-nodes.
- [3] Unless maybe you're using a system with redundant CPUs, e.g. Rocket
  Control. In which case: "Why does your rocket need a knowledge base!!??"

## Implementation

Remember: The database represents data as semantic network. Each edge in this
graph is stored as a fixed size trible (64bytes), a binary triple that consists
of an entity-id (16byte), an attribute-id (16byte) and an inline value (32byte).
Values that are too large to be inlined are stored as blobs, separately from the
tribles, with the blob's hash stored as the inline value.

The implementation is layered into multiple components with different
capabilities. These can be roughly categorized as follows:

- Unstructured binary information storage: Provided by the Persistent Adaptive
  Cuckoo Trie, an immutable in-memory data-structure, for segmented fixed length
  binary keys, which allows for efficient set operations and search.
  Segmentation allows for search to focus on pre-defined infix ranges of the
  key.
- Structured binary information storage: Provided by Trible Sets and Blob
  Caches. Trible Sets support set operations and query primitives for higher
  layers. They store data as covering PACT indices. Blob caches on the other
  hand store those values which require more space than the inlined 32byte. They
  use PACTS to map the value hash to the actual blob or a method to retrieve it
  lazily, e.g. via the network.
- Semantic information storage with a host language friendly API: The Knowledge
  Base data-structure makes use of one Trible Set and one Blob Cache. Instead of
  exposing the binary data of the lower levels directly, it provides writing and
  querying capabilities that match the model of the host language, aiming for
  seamless and convenient integration that is familiar to developers. This layer
  also provides a lot of the data-model in terms of the general graph structure,
  constraints, types, query capabilities and so on. The knowledge base is also
  an immutable datatype with set operations defined on it.
- Mutable containers: Heades are mutable references to immutable Knowledge Bases
  that provide a place where the changing of State can take place. They provide
  safe transaction semantics, and allow for subscriptions to the applied
  changes.
- Communication beyond the program: Connectors provide means to send and receive
  data from and to Heades. This could be over the network for use with tools like
  `trible archive` or or to store and load data to or from disk.

The resulting structure looks like this:

```
                  ┌────────┐
                  │  PACT  │
                  └────────┘             Unstructured
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
               ┌───────┴───────┐
               │               │
               ▼               ▼
        ┌────────────┐  ┌────────────┐
        │ Trible Set │  │ Blob Cache │
        └────────────┘  └────────────┘
               │               │
               └───────┬───────┘           Structured
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                       ▼
           ┏━━━━━━━━━━━━━━━━━━━━━━┓
           ┃    Knowledge Base    ┃          Semantic
           ┗━━━━━━━━━━━━━━━━━━━━━━┛        & Embedded
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                       ▼
                ╔════════════╗
                ║    Head    ║                Mutable
                ╚════════════╝         & Subscribable
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─▲─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
        ┌────────────┬─┴───────┐
        ▼            ▼         ▼
 ┌─────────────┐ ┌───────┐ ┌───────┐
 │  Websocket  │ │ File  │ │  S3   │   ...      Comms
 └─────────────┘ └───────┘ └───────┘        & Storage
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
```
