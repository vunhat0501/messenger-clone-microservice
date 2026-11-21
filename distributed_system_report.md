# Distributed Systems Architecture Report & Evaluation

## 1. Executive Verdict: Is This Project a Distributed System?

> [!IMPORTANT]
> **Answer: YES, this project is definitely a Distributed System.**
> It fulfills the formal definition established by Leslie Lamport and Coulouris et al.: _"A system in which hardware or software components located at networked computers communicate and coordinate their actions only by passing messages."_

The architecture is not a monolithic application; it is a **multi-tier, loosely-coupled, distributed microservices and replicated data system** with distinct failure domains, asynchronous message brokers, load-balanced multi-instance gateways, distributed caching, and multi-node replicated data stores.

---

## 2. Distributed Architecture Overview

```mermaid
flowchart TB
  classDef client fill:#f9f9f9,stroke:#333,stroke-width:2px,color:black;
  classDef edge fill:#e1e1e1,stroke:#333,stroke-width:2px,color:black;
  classDef gateway fill:#d4e6f1,stroke:#333,stroke-width:2px,color:black;
  classDef broker fill:#fcf3cf,stroke:#333,stroke-width:2px,color:black;
  classDef service fill:#f2d7d5,stroke:#333,stroke-width:2px,color:black;
  classDef cache fill:#fdebd0,stroke:#333,stroke-width:2px,color:black;
  classDef db fill:#d5f5e3,stroke:#333,stroke-width:2px,color:black;

  Client(["Client Application - Next.js 16 / React 19"]):::client

  subgraph Edge ["Edge / Entry Tier"]
    LB{"Nginx Load Balancer - :80 / :8080"}:::edge
  end

  subgraph Gateways ["Gateway Tier (Scaled Instances)"]
    direction LR
    GW1["API Gateway Instance 1 (:8008)<br/>(NestJS HTTP + Socket.IO)"]:::gateway
    GW2["API Gateway Instance 2 (:8009)<br/>(NestJS HTTP + Socket.IO)"]:::gateway
  end

  subgraph Infrastructure ["Shared Distributed Infrastructure"]
    PubSub[("Redis (:6379)<br/>• Socket.IO Redis Adapter<br/>• Multi-Instance Presence<br/>• Keyv Global Data Cache")]:::cache
    Broker[["RabbitMQ (:5672)<br/>AMQP Message Broker / RPC Queues"]]:::broker
  end

  subgraph Services ["Microservices Tier"]
    direction LR
    AuthSvc["Auth Service (NestJS RPC)<br/>Identity, Users, TypeORM"]:::service
    ChatSvc["Chat Service (NestJS RPC)<br/>Conversations, Messages, Mongoose"]:::service
  end

  subgraph Databases ["Database Tier"]
    subgraph RelationalDB ["PostgreSQL Cluster (1 Primary + 2 Replicas)"]
      SQL_Pri[("PostgreSQL Primary (:5432)<br/>WAL Level: replica")]:::db
      SQL_Rep[("PostgreSQL Replica 1 (:5433)<br/>Hot Standby")]:::db
      SQL_Rep2[("PostgreSQL Replica 2 (:5434)<br/>Hot Standby")]:::db
    end

    subgraph DocumentDB ["MongoDB Replica Set rs0 (1 Primary + 2 Replicas)"]
      NoSQL_Pri[("MongoDB Primary (:27017)<br/>Priority: 2")]:::db
      NoSQL_Rep[("MongoDB Secondary 1 (:27018)<br/>Priority: 1")]:::db
      NoSQL_Rep2[("MongoDB Secondary 2 (:27019)<br/>Priority: 1")]:::db
    end
  end

  %% Client to Edge
  Client -->|"HTTP / WebSockets"| LB

  %% Load Balancing to Gateways
  LB -->|"ip_hash / Round-Robin"| GW1
  LB -->|"ip_hash / Round-Robin"| GW2

  %% Gateway WebSocket Syncing & Presence via Redis
  GW1 <-->|"Pub/Sub State Sync & Presence"| PubSub
  GW2 <-->|"Pub/Sub State Sync & Presence"| PubSub

  %% Gateway to Microservices via RabbitMQ
  GW1 <-->|"RPC Messages (auth_queue / chat_queue)"| Broker
  GW2 <-->|"RPC Messages (auth_queue / chat_queue)"| Broker

  Broker <--> AuthSvc
  Broker <--> ChatSvc

  %% Microservices to Redis Distributed Cache
  AuthSvc <-->|"Cache-Aside (Users & Profiles)"| PubSub
  ChatSvc <-->|"Cache-Aside (Conversations & History)"| PubSub

  %% Services to Relational Database
  AuthSvc -->|"Writes & Primary Reads"| SQL_Pri
  AuthSvc -->|"Read-Only Directory Queries"| SQL_Rep
  AuthSvc -->|"Read-Only Directory Queries"| SQL_Rep2
  SQL_Pri -.->|"Physical Streaming Replication"| SQL_Rep
  SQL_Pri -.->|"Physical Streaming Replication"| SQL_Rep2

  %% Services to Document Database
  ChatSvc -->|"Writes (w: majority)"| NoSQL_Pri
  ChatSvc -->|"secondaryPreferred Reads"| NoSQL_Rep
  ChatSvc -->|"secondaryPreferred Reads"| NoSQL_Rep2
  NoSQL_Pri -.->|"Oplog Sync & Heartbeats"| NoSQL_Rep
  NoSQL_Pri -.->|"Oplog Sync & Heartbeats"| NoSQL_Rep2
```

---

## 3. End-to-End Distributed Workflows

### Workflow 1: Authentication & Token Rotation (Cache Invalidation & Primary Write)

Demonstrates the write path for authentication, password hashing, transaction boundaries, and Redis cache invalidation.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser (Next.js)
    participant Nginx as Nginx Proxy (:80)
    participant GW as API Gateway (:8008/:8009)
    participant Rabbit as RabbitMQ (auth_queue)
    participant Auth as Auth Microservice
    participant Redis as Redis Cache
    participant PG_Pri as PostgreSQL Primary
    participant PG_Rep as PostgreSQL Replica

    Client->>Nginx: POST /api/auth/signup { userName, email, password }
    Nginx->>GW: Forward HTTP Request
    GW->>Rabbit: RPC Call: send('auth.signup', payload)
    Rabbit->>Auth: Consume message
    Auth->>Auth: Hash password with Argon2
    Auth->>PG_Pri: BEGIN Transaction (Create User & Auth Entity)
    PG_Pri-->>Auth: Commit & Return UUIDs
    Auth->>Redis: Invalidate Cache: DEL users:all
    PG_Pri-->>PG_Rep: Async Physical WAL Streaming
    Auth-->>Rabbit: Return AuthenticatedUser
    Rabbit-->>GW: Return response
    GW-->>Nginx: 201 Created Envelope { data: user }
    Nginx-->>Client: Set HttpOnly Cookies & Session
```

---

### Workflow 2: Cross-Gateway Real-Time Messaging & Distributed Synchronization

Illustrates how two users connected to completely different API Gateway instances exchange real-time messages via Redis Pub/Sub adapter and MongoDB majority persistence.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A on GW1 :8008)
    participant GW1 as API Gateway Instance 1 (:8008)
    participant Redis as Redis Adapter & Cache
    participant Rabbit as RabbitMQ (chat_queue)
    participant Chat as Chat Microservice
    participant Mongo_Pri as MongoDB Primary (rs0)
    participant Mongo_Rep as MongoDB Secondary (rs0)
    participant GW2 as API Gateway Instance 2 (:8009)
    actor Bob as Bob (Client B on GW2 :8009)

    Alice->>GW1: WS Emit 'sendMessage' { conversationId, text, senderId }
    GW1->>Rabbit: RPC Call: send('save_message', payload)
    Rabbit->>Chat: Consume 'save_message'
    Chat->>Mongo_Pri: Insert Message & Update Conversation (w: majority)
    Mongo_Pri->>Mongo_Rep: Oplog Replication & Quorum Ack
    Mongo_Rep-->>Mongo_Pri: Acknowledged
    Mongo_Pri-->>Chat: Saved Message Document
    Chat->>Redis: Invalidate Cache: chat:messages & userConversations
    Chat-->>Rabbit: Return savedMessage
    Rabbit-->>GW1: RPC Response
    GW1->>Redis: Redis Adapter Publish 'newMessage' to room (conversationId)
    Redis-->>GW1: Local Room Broadcast
    Redis-->>GW2: Cross-Gateway Broadcast (Redis Adapter)
    GW1-->>Alice: Emit 'newMessage' (Echo / Confirmation)
    GW2-->>Bob: Emit 'newMessage' (Delivered in Real-Time)
```

---

### Workflow 3: Multi-Instance Real-Time Online/Offline Presence Tracking

Demonstrates how presence state is synchronized across nodes using Redis Sets when clients connect, open multiple tabs, or disconnect.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Device (Tab 1 / Tab 2)
    participant GW as API Gateway Instance
    participant Redis as Redis Server
    participant GatewayCluster as All Gateway Instances (:8008 & :8009)
    actor Peers as Other Online Users

    Note over User,Redis: --- USER CONNECTS (TAB 1) ---
    User->>GW: WebSocket Handshake with JWT
    GW->>GW: Verify JWT token (extract userId)
    GW->>Redis: SADD presence:user_sockets:<userId> <socketId_1>
    GW->>Redis: SADD presence:online_users <userId>
    GW->>Redis: SCARD presence:user_sockets:<userId>
    Redis-->>GW: count = 1 (First Connection -> Online!)
    GW->>Redis: SMEMBERS presence:online_users
    Redis-->>GW: Current Online User IDs
    GW-->>User: Emit 'onlineUsers' [userId, ...]
    GW->>GatewayCluster: Broadcast 'userStatusChanged' { userId, status: 'online' }
    GatewayCluster-->>Peers: Emit 'userStatusChanged' -> Green Avatar Dot

    Note over User,Redis: --- MULTIPLE TABS SUPPORT (TAB 2) ---
    User->>GW: Tab 2 Connects (socketId_2)
    GW->>Redis: SADD presence:user_sockets:<userId> <socketId_2>
    Redis-->>GW: count = 2 (Already Online -> No redundant broadcast)

    Note over User,Redis: --- TAB 1 CLOSES ---
    User->>GW: Tab 1 Closes (Disconnect socketId_1)
    GW->>Redis: SREM presence:user_sockets:<userId> <socketId_1>
    Redis-->>GW: remaining count = 1 (User Still Online on Tab 2)

    Note over User,Redis: --- ALL TABS CLOSED (OFFLINE) ---
    User->>GW: Tab 2 Closes (Disconnect socketId_2)
    GW->>Redis: SREM presence:user_sockets:<userId> <socketId_2>
    Redis-->>GW: remaining count = 0 (Last Connection Closed!)
    GW->>Redis: SREM presence:online_users <userId>
    GW->>GatewayCluster: Broadcast 'userStatusChanged' { userId, status: 'offline' }
    GatewayCluster-->>Peers: Emit 'userStatusChanged' -> Gray Avatar Dot
```

---

### Workflow 4: Distributed Cache-Aside & Replica Read Path

Demonstrates how read queries for the user directory or conversation history bypass the primary database.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser
    participant GW as API Gateway
    participant Rabbit as RabbitMQ
    participant Svc as Auth / Chat Microservice
    participant Redis as Redis Cache
    participant ReplicaDB as PostgreSQL Replica / MongoDB Secondary

    Client->>GW: GET /api/users
    GW->>Rabbit: RPC Call: send('user.find_all')
    Rabbit->>Svc: Process query
    Svc->>Redis: GET users:all

    alt Cache Hit
        Redis-->>Svc: Return cached users list
    else Cache Miss
        Redis-->>Svc: null / expired
        Svc->>ReplicaDB: Query Read-Replica (slave query runner / secondaryPreferred)
        ReplicaDB-->>Svc: Return data
        Svc->>Redis: SET users:all data (TTL: 60s)
    end

    Svc-->>Rabbit: Return data
    Rabbit-->>GW: RPC Response
    GW-->>Client: 200 OK Envelope
```

---

## 4. Entity-Relationship Design (ERD)

The system employs **Polyglot Persistence**:

- **PostgreSQL**: Relational integrity for user identities, credentials, role-based access control, and soft deletion. Primary keys are UUIDs (`gen_random_uuid()`).
- **MongoDB**: Flexible JSON documents for nested conversation participants, unread receipts, and chat message streams.

```mermaid
erDiagram
    USERS ||--o{ AUTH : "has many auth credentials (user_id)"
    CONVERSATIONS ||--o{ PARTICIPANTS : "embeds array of participants"
    CONVERSATIONS ||--o{ MESSAGES : "contains messages (conversationId)"
    USERS ||..o{ PARTICIPANTS : "logical reference (userId)"
    USERS ||..o{ MESSAGES : "logical reference (senderId)"
    USERS }o..o{ MESSAGES : "logical reference (readBy)"

    USERS {
        uuid id PK "gen_random_uuid()"
        varchar user_name UK "Unique active username"
        varchar email UK "Unique email address"
        users_role_enum role "Default 'user' (admin, user)"
        varchar avatar_url "CDN / storage image link"
        varchar bio "User biography"
        timestamp created_at "Account creation timestamp"
        timestamp deleted_at "Soft deletion timestamp (null if active)"
    }

    AUTH {
        uuid id PK "gen_random_uuid()"
        uuid user_id FK "References users.id ON DELETE CASCADE"
        varchar hashed_password "Argon2id hashed password string"
        varchar auth_provider "Provider type (default 'local')"
        varchar auth_provider_id "External OAuth provider ID"
        boolean email_verified "Email verification status"
        varchar refresh_token UK "Hashed refresh token for rotation"
        timestamp created_at "Created timestamp"
        timestamp updated_at "Updated timestamp"
    }

    CONVERSATIONS {
        ObjectId _id PK "MongoDB ObjectId"
        ParticipantArray participants "Embedded participant documents"
        boolean isGroup "Group chat flag (false = direct)"
        string groupName "Name for group chats"
        Date lastMessageAt "Timestamp of most recent message"
        string lastMessageSnippet "Snippet preview of latest text"
        Date createdAt "Creation timestamp"
        Date updatedAt "Modification timestamp"
        number __v "Document version key"
    }

    PARTICIPANTS {
        string userId "Logical reference to users.id (UUID)"
        string userName "Denormalized username"
        string avatarUrl "Denormalized avatar image link"
    }

    MESSAGES {
        ObjectId _id PK "MongoDB ObjectId"
        ObjectId conversationId "Indexed ref to Conversation._id"
        string senderId "Logical reference to users.id (UUID)"
        string text "Message body text"
        StringArray readBy "Array of user UUIDs who read the message"
        Date createdAt "Creation timestamp (compound index)"
        Date updatedAt "Update timestamp"
        number __v "Document version key"
    }
```

### Database Entities & Schema Deep Dive

#### 1. PostgreSQL Relational Schemas (`apps/auth-service`)

- **`users` Table**:
  - `id` (`uuid`, PK): Primary identifier using PostgreSQL native `gen_random_uuid()`.
  - `user_name` & `email`: Enforced unique constraints and indexed. Partial index `idx_active_users_username` filters out soft-deleted users (`deleted_at IS NULL`).
  - `role`: Native PostgreSQL enum `users_role_enum ('admin', 'user')`.
  - `deleted_at`: Soft-deletion timestamp. Allows account recovery and historical audit without cascading destructive deletes.
- **`auth` Table**:
  - `id` (`uuid`, PK): Unique credential record ID.
  - `user_id` (`uuid`, FK): Foreign key referencing `users.id` with `ON DELETE CASCADE`.
  - `hashed_password`: Stored as high-entropy Argon2id hash (`$argon2id$v=19$m=65536,t=3,p=4$...`).
  - Composite unique constraints: `UNIQUE (user_id, auth_provider)` and `UNIQUE (auth_provider, auth_provider_id)` guarantee credential integrity.
  - `refresh_token`: Indexed unique column for JWT refresh token rotation.

#### 2. MongoDB Document Schemas (`apps/chat-service`)

- **`conversations` Collection**:
  - Multikey index on `participants.userId` allows $O(1)$ discovery of all conversations involving a user.
  - `isGroup`: Differentiates direct messages from group chats.
  - Denormalized `lastMessageSnippet` and `lastMessageAt` avoid multi-document lookups for the chat sidebar.
- **Embedded `participants` Sub-document**:
  - Embedded directly inside `conversations` with `_id: false` to eliminate JOIN operations across collections.
  - Stores `userId` (logical UUID), `userName`, and `avatarUrl` for instantaneous UI rendering.
- **`messages` Collection**:
  - Compound index `{ conversationId: 1, createdAt: -1 }` guarantees rapid pagination of chat history from latest to oldest.
  - `readBy`: Array of UUID strings indicating read receipts.

---

## 5. Core Distributed Systems Criteria Analysis

| Distributed System Pillar                          | How It Is Implemented In This Project                                                                                                                                                                                                                                                             | Distributed Characteristic                                               |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------- |
| **1. Concurrency & Network Communication**         | Services run as independent OS processes/containers communicating over TCP/IP via HTTP, WebSockets, AMQP (RabbitMQ), and Redis protocol.                                                                                                                                                          | **No shared memory**; interaction occurs purely via message passing.     |
| **2. Horizontal Scaling & Load Balancing**         | Nginx sits in front of twin API Gateway instances (`:8008` and `:8009`), routing HTTP traffic and upgrading WebSocket connections using `ip_hash`.                                                                                                                                                | Load distribution across multiple gateway instances.                     |
| **3. Message-Oriented Middleware (MOM)**           | Gateway forwards client actions to microservices using RabbitMQ (`auth_queue` and `chat_queue`) over RPC pattern (`send/firstValueFrom`).                                                                                                                                                         | Decoupled execution, message buffering, and service discovery.           |
| **4. Distributed State & Multi-Node Coordination** | Multi-instance WebSockets use `@socket.io/redis-adapter` for pub/sub cross-node event broadcasting. Presence is tracked across nodes using Redis Sets (`presence:online_users` and `presence:user_sockets:<userId>`).                                                                             | State synchronization across independent server nodes.                   |
| **5. Distributed Caching & Cache-Aside**           | Global Redis cache (`@nestjs/cache-manager` + `@keyv/redis`) with cache invalidation across services on write mutations.                                                                                                                                                                          | Reduced latency and shared memory offloading across distributed workers. |
| **6. Database Replication & Read Distribution**    | • **PostgreSQL**: Primary-Standby physical WAL streaming replication (`max_wal_senders=10`, `hot_standby=on`). Write queries go to Master; directory reads query Slave runner.<br>• **MongoDB**: 2-node Replica Set (`rs0`) with primary election, oplog replication, and keyfile authentication. | Redundancy, write-master/read-replica topology.                          |
| **7. Heterogeneous Polyglot Persistence**          | Relational data (Users, Auth credentials) in PostgreSQL; document/chat data (Conversations, Messages) in MongoDB; transient session state in Redis.                                                                                                                                               | Polyglot persistence tailored to data models.                            |
| **8. Independent Failure Domains**                 | A crash of `chat-service` does not bring down `auth-service` or the HTTP Gateway. Messages remain queued in RabbitMQ until the service recovers.                                                                                                                                                  | Partial failure tolerance.                                               |

---

## 6. Theoretical Analysis for Academic / Technical Report

### A. CAP Theorem Mapping

- **PostgreSQL Layer (AP / CP Boundary)**:
  - Configured with **asynchronous streaming replication**.
  - TypeORM directs writes to the primary and specific reads to the replica.
  - During network partition between primary and standby, the primary continues accepting writes (**High Availability for writes**), trading off strict real-time consistency on the replica (Eventual Consistency / replication lag).
- **MongoDB Layer (Tunable CP System)**:
  - Uses `writeConcern: { w: 'majority', wtimeoutMS: 10000 }` and retryable writes.
  - In a partition or split-brain, writes are rejected if a quorum cannot acknowledge the write, favoring **Consistency** over Availability.
- **Redis & Gateway (AP System)**:
  - In-memory presence and pub/sub favor instant availability and low latency over strict linearizability.

### B. Fallacies of Distributed Computing Addressed

1. **"The network is reliable"**: Addressed via RabbitMQ durable queues, reconnection logic, Redis connection retry, and MongoDB retryable writes (`retryWrites: true`).
2. **"Latency is zero"**: Addressed via Redis caching layer (`CACHE_TTL`, Cache-Aside pattern) to minimize redundant database round-trips.
3. **"Topology doesn't change"**: Addressed by Nginx upstream abstraction (`api_gateway` server group) and RabbitMQ queue routing keys.

---

## 7. What Makes It a Distributed System vs. What Can Be Enhanced

### What Is Already Fully Distributed:

- Microservices decoupled by Message Broker (RabbitMQ RPC).
- Horizontally scaled gateway tier behind a reverse proxy (Nginx).
- Multi-instance WebSocket synchronization through Redis pub/sub.
- Distributed user presence across instances using Redis sets.
- Multi-node database replication (PostgreSQL WAL streaming + MongoDB Replica Set).
- Shared distributed cache (Redis).

### Optional Recommendations / Enhancements (To Mention in Future Work of Your Report):

1. **Automated Database Failover**:
   - Currently, PostgreSQL replication is standby read-replica with manual promotion (documented in `docs/database-replication.md`). Adding an orchestrator like **Patroni** or **pg_auto_failover** would bring automated leader election.
   - For MongoDB, adding an **Arbiter** or 3rd data member would allow 1-node failure tolerance without losing write quorum (since 2 nodes require 2/2 votes for majority).
2. **Distributed Tracing & Observability**:
   - Introduce **OpenTelemetry**, **Jaeger**, or correlation IDs (`X-Correlation-ID`) across HTTP Gateway -> RabbitMQ message headers -> Microservices to trace requests end-to-end.
3. **Centralized Service Discovery**:
   - Adding a service registry (e.g. Consul or Kubernetes DNS) if deploying beyond Docker Compose.
4. **Resilience & Circuit Breaking**:
   - Integrate circuit breaker patterns (e.g., using `opossum` or NestJS interceptors) when downstream RPC or Redis calls experience timeout spikes.

---

## 9. Report Template Snippet (Ready to Copy)

> ### System Architecture Overview (For Report)
>
> \*"The developed social media platform is designed as a distributed, service-oriented architecture (SOA). The presentation layer is built with Next.js 16 and React 19. Incoming HTTP and WebSocket connections are load-balanced via an Nginx reverse proxy using IP-hashing to distribute requests across multiple stateless API Gateway instances. Communication between the edge gateway and internal business microservices (Authentication and Chat) is decoupled through RabbitMQ message-oriented middleware using asynchronous RPC queues.
>
> Cross-gateway WebSocket state and online presence are coordinated in real-time through a Redis pub/sub adapter and distributed in-memory sets. Persistence employs a distributed polyglot model: relational identity management is backed by a PostgreSQL cluster with primary-standby WAL streaming replication, while conversation and message history is managed by a MongoDB replica set (rs0) enforcing majority write concerns. A distributed Redis cache-aside layer is integrated across services to reduce read latency and maintain high throughput."\*
