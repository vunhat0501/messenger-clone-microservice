# Distributed Systems Architecture Report & Evaluation

## 1. Executive Verdict: Is This Project a Distributed System?

> [!IMPORTANT]
> **Answer: YES, this project is definitely a Distributed System.**
> It fulfills the formal definition established by Leslie Lamport and Coulouris et al.: _"A system in which hardware or software components located at networked computers communicate and coordinate their actions only by passing messages."_

The architecture is not a monolithic application; it is a **multi-tier, loosely-coupled, distributed microservices and replicated data system** with distinct failure domains, asynchronous message brokers, load-balanced multi-instance gateways, distributed caching, and multi-node replicated data stores.

---

## 2. Distributed Architecture Overview

The architecture is shown in two figures for readability: the application tier first, then the data tier. In the data tier the PostgreSQL primary role is not fixed to one node: after a failover any of the three nodes can be the primary (see Workflow 5).

### Application Tier

```mermaid
flowchart TB
  classDef client fill:#f9f9f9,stroke:#333,stroke-width:2px,color:black;
  classDef edge fill:#e1e1e1,stroke:#333,stroke-width:2px,color:black;
  classDef gateway fill:#d4e6f1,stroke:#333,stroke-width:2px,color:black;
  classDef broker fill:#fcf3cf,stroke:#333,stroke-width:2px,color:black;
  classDef service fill:#f2d7d5,stroke:#333,stroke-width:2px,color:black;
  classDef cache fill:#fdebd0,stroke:#333,stroke-width:2px,color:black;
  classDef db fill:#d5f5e3,stroke:#333,stroke-width:2px,color:black;

  Client(["Client Application<br/>Next.js 16 / React 19<br/>(BFF + Socket.IO client)"]):::client

  subgraph Edge ["Edge / Entry Tier"]
    LB{"Nginx :80 / :8080<br/>least_conn"}:::edge
  end

  subgraph Gateways ["Gateway Tier (Scaled Instances)"]
    direction LR
    GW1["API Gateway 1 (:8008)<br/>NestJS HTTP + Socket.IO"]:::gateway
    GW2["API Gateway 2 (:8009)<br/>NestJS HTTP + Socket.IO"]:::gateway
  end

  subgraph Infrastructure ["Shared Infrastructure"]
    direction LR
    PubSub[("Redis (:6379)<br/>Socket.IO adapter,<br/>presence, cache")]:::cache
    Broker[["RabbitMQ (:5672)<br/>RPC queues"]]:::broker
  end

  subgraph Services ["Microservices Tier"]
    direction LR
    AuthSvc["Auth Service<br/>Identity, Users"]:::service
    ChatSvc["Chat Service<br/>Conversations, Messages"]:::service
  end

  Data[("Database Tier<br/>(next figure)")]:::db

  Client -->|"HTTP / WebSockets"| LB
  LB --> GW1
  LB --> GW2
  GW1 <-->|"State sync, presence"| PubSub
  GW2 <-->|"State sync, presence"| PubSub
  GW1 <-->|"RPC"| Broker
  GW2 <-->|"RPC"| Broker
  Broker <-->|"auth_queue"| AuthSvc
  Broker <-->|"chat_queue"| ChatSvc
  AuthSvc <-.->|"Cache-aside"| PubSub
  ChatSvc <-.->|"Cache-aside"| PubSub
  AuthSvc --> Data
  ChatSvc --> Data
```

### Data Tier

```mermaid
flowchart TB
  classDef edge fill:#e1e1e1,stroke:#333,stroke-width:2px,color:black;
  classDef service fill:#f2d7d5,stroke:#333,stroke-width:2px,color:black;
  classDef db fill:#d5f5e3,stroke:#333,stroke-width:2px,color:black;

  AuthSvc["Auth Service<br/>(TypeORM)"]:::service
  ChatSvc["Chat Service<br/>(Mongoose)"]:::service

  subgraph RelationalDB ["PostgreSQL Cluster (1 Primary + 2 Standbys)"]
    direction TB
    Sentinel["postgres_sentinel<br/>failover, repointing, fencing"]:::edge
    SQL_Pri[("postgres_primary :5432<br/>Primary at start-up<br/>(the role moves after a failover)")]:::db
    SQL_Rep[("postgres_replica :5433<br/>Standby at start-up")]:::db
    SQL_Rep2[("postgres_replica_2 :5434<br/>Standby at start-up")]:::db
  end

  subgraph DocumentDB ["MongoDB Replica Set rs0 (3 Members)"]
    direction TB
    NoSQL_Pri[("mongo_primary :27017<br/>Primary, priority 2")]:::db
    NoSQL_Rep[("mongo_replica :27018<br/>Secondary, priority 1")]:::db
    NoSQL_Rep2[("mongo_replica_2 :27019<br/>Secondary, priority 1")]:::db
  end

  AuthSvc -->|"Writes and primary reads<br/>(follows the Primary)"| SQL_Pri
  AuthSvc -.->|"Directory reads"| SQL_Rep
  SQL_Pri -.->|"Streaming replication"| SQL_Rep
  SQL_Pri -.->|"Streaming replication"| SQL_Rep2
  Sentinel -.->|"Health checks every 5 s,<br/>promote, repoint, fence"| SQL_Pri

  ChatSvc -->|"Writes (w: majority)"| NoSQL_Pri
  ChatSvc -.->|"Optional reads<br/>(MONGO_READ_PREFERENCE, default primary)"| NoSQL_Rep
  NoSQL_Pri -.->|"Oplog, heartbeats, elections"| NoSQL_Rep
  NoSQL_Pri -.->|"Oplog, heartbeats, elections"| NoSQL_Rep2
```

### Deployment View

Demonstrates what runs where on the single development machine: the Node.js applications run directly on the host through pnpm (there is no Dockerfile for them), while the infrastructure and the databases run as Docker Compose containers.

```mermaid
flowchart LR
  classDef client fill:#f9f9f9,stroke:#333,stroke-width:2px,color:black;
  classDef edge fill:#e1e1e1,stroke:#333,stroke-width:2px,color:black;
  classDef gateway fill:#d4e6f1,stroke:#333,stroke-width:2px,color:black;
  classDef broker fill:#fcf3cf,stroke:#333,stroke-width:2px,color:black;
  classDef service fill:#f2d7d5,stroke:#333,stroke-width:2px,color:black;
  classDef cache fill:#fdebd0,stroke:#333,stroke-width:2px,color:black;
  classDef db fill:#d5f5e3,stroke:#333,stroke-width:2px,color:black;

  subgraph Procs ["Node.js processes on the host (pnpm, not containerised)"]
    direction TB
    Web["Next.js web + BFF<br/>:3000"]:::client
    subgraph GWs ["API Gateways"]
      direction TB
      GW1["gateway-8008<br/>:8008"]:::gateway
      GW2["gateway-8009<br/>:8009"]:::gateway
    end
    Auth["auth-service"]:::service
    Chat["chat-service"]:::service
  end

  subgraph Compose ["Docker Compose containers (one bridge network)"]
    direction TB
    subgraph Infra ["Infrastructure"]
      direction LR
      Nginx["app_nginx<br/>:80, :8080"]:::edge
      Redis["app_redis<br/>:6379"]:::cache
      Rabbit["app_rabbitmq<br/>:5672, :15672"]:::broker
    end
    subgraph PG ["PostgreSQL 18"]
      direction LR
      P1[("auth_postgres<br/>postgres_primary<br/>:5432")]:::db
      P2[("postgres_replica<br/>:5433")]:::db
      P3[("postgres_replica_2<br/>:5434")]:::db
      Sent["postgres_sentinel"]:::edge
    end
    subgraph MG ["MongoDB 8 replica set rs0"]
      direction LR
      M1[("chat_mongo<br/>mongo_primary<br/>:27017")]:::db
      M2[("mongo_replica<br/>:27018")]:::db
      M3[("mongo_replica_2<br/>:27019")]:::db
    end
  end

  Web -->|"HTTP, WebSocket"| Nginx
  Nginx -->|"host.docker.internal"| GWs
  GWs --> Redis
  GWs --> Rabbit
  Auth --> Rabbit
  Chat --> Rabbit
  Auth -->|"TypeORM"| PG
  Chat -->|"Mongoose"| MG
```

### Fault Model

Summarises which components are redundant and which are single points of failure, together with the fault types injected during testing.

```mermaid
flowchart LR
  classDef ok fill:#d5f5e3,stroke:#333,stroke-width:2px,color:black;
  classDef spof fill:#f2d7d5,stroke:#333,stroke-width:2px,color:black;
  classDef fault fill:#fcf3cf,stroke:#333,stroke-width:2px,color:black;

  Faults(["Injected faults<br/>stop, network partition,<br/>delay and packet loss, load"]):::fault

  subgraph Redundant ["Redundant: a single failure is tolerated"]
    direction TB
    GW["Gateway x2<br/>crash: clients reconnect through Nginx"]:::ok
    CHAT["chat-service x1..n<br/>crash of one instance: no message lost"]:::ok
    PG["PostgreSQL x3<br/>primary crash or partition:<br/>writes back after 23 to 26 s"]:::ok
    MG["MongoDB rs0 x3<br/>primary crash or partition:<br/>new primary after 10 to 12 s"]:::ok
  end

  subgraph Single ["Single points of failure"]
    direction TB
    NG["Nginx<br/>crash: the BFF loses its entry point (not measured)"]:::spof
    RD["Redis<br/>crash: services survive,<br/>cross-gateway messages lost meanwhile"]:::spof
    MQ["RabbitMQ<br/>crash: every RPC fails,<br/>recovers in 7 to 8 s"]:::spof
    AU["auth-service<br/>crash: sign-in and token refresh fail (not measured)"]:::spof
    SE["postgres_sentinel<br/>crash: no automatic promotion (not measured)"]:::spof
  end

  Faults -.-> Redundant
  Faults -.-> Single
```

---

## 3. End-to-End Distributed Workflows

### Workflow 1: Registration & Sign-in (BFF, Primary Writes)

Demonstrates the write path of authentication: the Next.js BFF route handlers, Argon2 password hashing, the sign-up transaction, cache invalidation, and the hashed refresh token stored on the PostgreSQL primary. Cookies are set by the BFF at sign-in only.

#### 1a. Registration

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser
    participant BFF as Next.js BFF<br/>(/api/auth/signup)
    participant Nginx as Nginx Proxy (:80)
    participant GW as API Gateway
    participant Rabbit as RabbitMQ (auth_queue)
    participant Auth as Auth Microservice
    participant Redis as Redis Cache
    participant PG as PostgreSQL Primary

    Client->>BFF: POST /api/auth/signup { userName, email, password }
    BFF->>Nginx: POST /auth/signup
    Nginx->>GW: Forward (least_conn)
    GW->>Rabbit: RPC Call: send('auth.signup', payload)
    Rabbit->>Auth: Consume message
    Auth->>Auth: Hash password with Argon2
    Auth->>PG: BEGIN, INSERT users, INSERT auth, COMMIT
    Auth->>Redis: Invalidate cache: DEL users:all
    Auth-->>GW: Created user (no credentials), via RabbitMQ
    GW-->>BFF: 201 Created Envelope { data: user }
    BFF-->>Client: 201 Created (no cookie is set at sign-up)
```

#### 1b. Sign-in

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser
    participant BFF as Next.js BFF<br/>(/api/auth/signin)
    participant GW as API Gateway<br/>(via Nginx)
    participant Rabbit as RabbitMQ (auth_queue)
    participant Auth as Auth Microservice
    participant PG as PostgreSQL Primary

    Client->>BFF: POST /api/auth/signin { email, password }
    BFF->>GW: POST /auth/signin
    GW->>Rabbit: RPC auth.validate_local, then auth.signin
    Rabbit->>Auth: Consume message
    Auth->>PG: SELECT user and credentials, verify the Argon2 hash
    Auth->>Auth: Sign access token and refresh token (JWT)
    Auth->>PG: UPDATE auth SET refresh_token = hash(refresh token)
    Auth-->>GW: accessToken, refreshToken, user (via RabbitMQ)
    GW-->>BFF: 201 Created Envelope { data }
    BFF-->>Client: Set-Cookie access_token (15 min), refresh_token (7 days), HttpOnly
```

---

### Workflow 2: Cross-Gateway Real-Time Messaging & Distributed Synchronisation

Illustrates how two users connected to different API Gateway instances exchange real-time messages via the Redis adapter, with idempotent persistence (`clientMessageId`), MongoDB majority acknowledgement and a 10-second RPC timeout.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A on GW1 :8008)
    participant GW1 as API Gateway 1 (:8008)
    participant Rabbit as RabbitMQ (chat_queue)
    participant Chat as Chat Microservice
    participant Mongo as MongoDB Primary (rs0)
    participant Redis as Redis (adapter and cache)
    participant GW2 as API Gateway 2 (:8009)
    actor Bob as Bob (Client B on GW2 :8009)

    Alice->>GW1: WS sendMessage { conversationId, text, clientMessageId }
    Note over GW1: Sender id comes from the authenticated socket, not from the payload
    GW1->>Rabbit: RPC save_message (timeout 10 s)
    Rabbit->>Chat: Consume save_message
    Chat->>Mongo: Look up clientMessageId, insert message, update conversation (w: majority)
    Mongo-->>Chat: Saved message (the existing one if the id was already stored)
    Chat->>Redis: Invalidate message and conversation caches
    Chat-->>GW1: savedMessage (via RabbitMQ)
    GW1->>Redis: Redis adapter publishes newMessage to the room
    Redis-->>GW2: Cross-gateway broadcast
    GW2-->>Bob: newMessage (delivered in real time)
    GW1-->>Alice: Ack with savedMessage, plus newMessage and conversationUpdated

    opt No answer within 10 s
        GW1-->>Alice: Ack error "Message service timeout"
        Note over Alice: UI shows Not sent, Retry reuses the same clientMessageId
    end
```

---

### Workflow 3: Multi-Instance Real-Time Online/Offline Presence Tracking

Demonstrates how presence is kept in one Redis sorted set per user (socket id scored by its last heartbeat), refreshed every 10 s and swept every 15 s. A gateway that dies without closing its sockets therefore no longer leaves users online forever: their entries go stale after 30 s.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Device
    participant GW as Gateway
    participant Redis as Redis
    participant Others as Other Gateways
    actor Peers as Other Users

    Note over GW: User connects (first tab)
    User->>GW: WebSocket handshake with JWT cookie
    GW->>Redis: ZADD presence:sockets:userId (score now)
    GW->>Redis: SADD presence:online_users userId
    Redis-->>GW: 1 = user came online
    GW->>Others: userStatusChanged online
    Others-->>Peers: Green dot

    Note over GW,Redis: While connected
    loop every 10 s
        GW->>Redis: Heartbeat: ZADD score = now
    end
    loop every 15 s on every gateway
        GW->>Redis: Drop sockets older than 30 s, SREM if none left
    end

    Note over GW: A tab closes
    User->>GW: Disconnect
    GW->>Redis: ZREM presence:sockets:userId
    alt Other tab still connected
        Redis-->>GW: ZCARD above 0, stays online
    else Last socket removed
        GW->>Redis: SREM presence:online_users
        GW->>Others: userStatusChanged offline
        Others-->>Peers: Grey dot
    end
```

---

### Workflow 4: Distributed Cache-Aside & Replica Read Path

Demonstrates how read queries are served from Redis and fall back to a standby (users) or to MongoDB (messages). Reading from MongoDB secondaries is optional (`MONGO_READ_PREFERENCE`, `primary` by default) and may return slightly stale data.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Browser
    participant GW as API Gateway
    participant Rabbit as RabbitMQ
    participant Svc as Auth / Chat Microservice
    participant Redis as Redis Cache
    participant DB as PostgreSQL Standby (users)<br/>or MongoDB (messages)

    Client->>GW: GET users, conversations or messages
    GW->>Rabbit: RPC call
    Rabbit->>Svc: Process query
    Svc->>Redis: GET cache key

    alt Cache hit
        Redis-->>Svc: Cached value
    else Cache miss
        Svc->>DB: Query (users: standby query runner, messages: MONGO_READ_PREFERENCE, default primary)
        DB-->>Svc: Data
        Svc->>Redis: SET with TTL (60 s lists, only the default page of 100 messages)
    end

    Svc-->>GW: Data (via RabbitMQ)
    GW-->>Client: 200 OK Envelope
```

---

### Workflow 5: PostgreSQL Primary Failover (Sentinel)

Demonstrates automatic recovery of the relational tier: failure detection, a second opinion from the standbys, promotion of the standby with the most WAL, repointing of the other standby, the topology watcher of the Auth microservice, and the return of the old primary (re-cloned as a standby, or fenced after a network partition). Measured recovery of writes: 23 to 26 s.

```mermaid
sequenceDiagram
    autonumber
    participant Old as Old Primary
    participant Sentinel as postgres_sentinel
    participant StdB as Standby B
    participant StdA as Standby A<br/>(most WAL)
    participant Auth as auth-service
    actor Client as Web Browser

    Note over Old: Primary stops
    loop every 5 s, 3 failed rounds
        Sentinel-xOld: pg_is_in_recovery()
    end
    Sentinel->>StdA: Still streaming? (second opinion)
    StdA-->>Sentinel: No, primary is gone
    Sentinel->>StdA: pg_promote()
    StdA-->>Sentinel: Now PRIMARY (new timeline)
    Sentinel->>StdB: Create slot, repoint, reload
    StdB->>StdA: Streaming resumes
    Auth->>StdA: Topology check finds new primary
    Client->>Auth: Sign-in works again (23 to 26 s)

    Note over Old: Old primary comes back
    alt Container restart
        Old->>StdA: Newer timeline: discard data, pg_basebackup
    else Network partition (still writable)
        Sentinel->>Old: Two primaries: shut stale one down
        Old->>StdA: Restarts and re-clones as standby
    end
```

---

### Workflow 6: Gateway Failure & Client Reconnection

Demonstrates what happens when the gateway serving a client is killed: Socket.IO reconnects through Nginx to the surviving gateway, the client re-joins its open conversation, and the stale presence entry expires if the user does not come back.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice
    participant Nginx as Nginx
    participant GWA as Gateway A
    participant GWB as Gateway B
    participant Redis as Redis
    actor Bob as Bob (on B)

    Alice->>Nginx: Socket.IO (WebSocket)
    Nginx->>GWA: least_conn picks Gateway A
    GWA->>Redis: Presence heartbeat every 10 s

    Note over GWA: Gateway A is killed
    GWA--xAlice: Socket closes
    Alice->>Nginx: Socket.IO reconnects by itself
    Nginx->>GWB: Routed to the surviving gateway
    GWB->>Redis: Verify cookie, register socket
    GWB-->>Alice: gatewayConnected, onlineUsers
    Alice->>GWB: joinConversation, then sendMessage<br/>(same clientMessageId on retry)
    GWB-->>Bob: newMessage

    opt Alice does not reconnect
        Note over Redis: Old socket entry stale after 30 s
        GWB->>Redis: Sweep every 15 s removes it
        GWB-->>Bob: userStatusChanged offline (31 to 40 s)
    end
```

---

### Workflow 7: MongoDB Primary Election

Demonstrates replica set recovery: the two surviving members hold a majority (2 of 3), elect a new primary within 10 to 12 s, and the old primary rejoins as a secondary.

```mermaid
sequenceDiagram
    autonumber
    participant Chat as Chat Microservice
    participant M1 as mongo_primary<br/>(priority 2)
    participant M2 as mongo_replica
    participant M3 as mongo_replica_2

    Note over M1: Primary stops
    M2-xM1: Heartbeat fails
    M3-xM1: Heartbeat fails
    M2->>M3: Request vote (2 of 3 is a majority)
    M3-->>M2: Vote granted
    Note over M2: One of the two becomes PRIMARY
    Chat->>M2: Driver finds the new primary and retries the write
    M2-->>Chat: Acknowledged by a majority (10 to 12 s after the crash)

    Note over M1: Old primary restarts
    M1->>M2: Catches up from the oplog, rejoins as SECONDARY
    Note over M1,M2: Priority 2 lets mongo_primary take the role back later
```

---

## 4. Entity-Relationship Design (ERD)

The system employs **Polyglot Persistence**:

- **PostgreSQL**: Relational integrity for user identities, credentials, role-based access control, and soft deletion. Primary keys are UUIDs (`uuid_generate_v4()`).
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
        uuid id PK "uuid_generate_v4()"
        varchar user_name UK "Unique active username"
        varchar email UK "Unique email address"
        users_role_enum role "Default 'user' (admin, user)"
        varchar avatar_url "CDN / storage image link"
        varchar bio "User biography"
        timestamp created_at "Account creation timestamp"
        timestamp deleted_at "Soft deletion timestamp (null if active)"
    }

    AUTH {
        uuid id PK "uuid_generate_v4()"
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
        string clientMessageId "Client-generated id for idempotent sends (unique per conversation)"
        Date createdAt "Creation timestamp (compound index)"
        Date updatedAt "Update timestamp"
        number __v "Document version key"
    }
```

### Database Entities & Schema Deep Dive

#### 1. PostgreSQL Relational Schemas (`apps/auth-service`)

- **`users` Table**:
  - `id` (`uuid`, PK): Primary identifier generated by `uuid_generate_v4()`.
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
  - `clientMessageId`: Optional string generated by the client. A unique partial index on `{ conversationId, clientMessageId }` (only when the id is a string) makes retries idempotent: a repeated send returns the stored message instead of inserting a duplicate.

---

## 5. Core Distributed Systems Criteria Analysis

| Distributed System Pillar                          | How It Is Implemented In This Project                                                                                                                                                                                                                                                                                                                                                                                                                    | Distributed Characteristic                                               |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **1. Concurrency & Network Communication**         | Services run as independent OS processes/containers communicating over TCP/IP via HTTP, WebSockets, AMQP (RabbitMQ), and Redis protocol.                                                                                                                                                                                                                                                                                                                 | **No shared memory**; interaction occurs purely via message passing.     |
| **2. Horizontal Scaling & Load Balancing**         | Nginx sits in front of twin API Gateway instances (`:8008` and `:8009`), routing HTTP traffic and upgrading WebSocket connections using the `least_conn` strategy (each new connection goes to the gateway holding the fewest open connections), which suits long-lived WebSockets.                                                                                                                                                                      | Load distribution across multiple gateway instances.                     |
| **3. Message-Oriented Middleware (MOM)**           | Gateway forwards client actions to microservices using RabbitMQ (`auth_queue` and `chat_queue`) over RPC pattern (`send/firstValueFrom`).                                                                                                                                                                                                                                                                                                                | Decoupled execution, message buffering, and service discovery.           |
| **4. Distributed State & Multi-Node Coordination** | Multi-instance WebSockets use `@socket.io/redis-adapter` for pub/sub cross-node event broadcasting. Presence is tracked across nodes with a Redis set of online users (`presence:online_users`) and one sorted set of heartbeat-scored sockets per user (`presence:sockets:<userId>`), refreshed every 10 s and expired after 30 s.                                                                                                                      | State synchronization across independent server nodes.                   |
| **5. Distributed Caching & Cache-Aside**           | Global Redis cache (`@nestjs/cache-manager` + `@keyv/redis`) with cache invalidation across services on write mutations.                                                                                                                                                                                                                                                                                                                                 | Reduced latency and shared memory offloading across distributed workers. |
| **6. Database Replication & Read Distribution**    | • **PostgreSQL**: Primary-Standby physical WAL streaming replication (`max_wal_senders=10`, `hot_standby=on`). Write queries go to Master; directory reads query Slave runner. A sentinel daemon promotes a standby automatically when the primary fails and fences a stale primary that comes back (`scripts/postgres-sentinel.sh`).<br>• **MongoDB**: 3-node Replica Set (`rs0`) with primary election, oplog replication, and keyfile authentication. | Redundancy, write-master/read-replica topology.                          |
| **7. Heterogeneous Polyglot Persistence**          | Relational data (Users, Auth credentials) in PostgreSQL; document/chat data (Conversations, Messages) in MongoDB; transient session state in Redis.                                                                                                                                                                                                                                                                                                      | Polyglot persistence tailored to data models.                            |
| **8. Independent Failure Domains**                 | A crash of `chat-service` does not bring down `auth-service` or the HTTP Gateway. Messages remain queued in RabbitMQ until the service recovers.                                                                                                                                                                                                                                                                                                         | Partial failure tolerance.                                               |

---

## 6. Theoretical Analysis for Academic / Technical Report

### A. CAP Theorem Mapping

- **PostgreSQL Layer (AP / CP Boundary)**:
  - Configured with **asynchronous streaming replication**.
  - TypeORM directs writes to the primary and specific reads to the replica.
  - During a network partition between primary and standby, the cut-off primary keeps accepting writes until the sentinel (about 15 seconds later) promotes a standby; when the old primary returns, the sentinel shuts it down and it is re-cloned as a standby, so writes it accepted while isolated are discarded. Replication is asynchronous, so the replica lags and unreplicated commits can be lost (eventual consistency, no linearizability). Measured recovery of writes: about 23 to 26 seconds (`report/README.md`, section 4.9).
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
- Distributed user presence across instances using Redis sets and heartbeats.
- Multi-node database replication (PostgreSQL WAL streaming + MongoDB Replica Set).
- Shared distributed cache (Redis).

### Optional Recommendations / Enhancements (To Mention in Future Work of Your Report):

1. **Automated Database Failover**:
   - PostgreSQL already fails over automatically through one sentinel daemon (documented in `docs/database-replication.md`), but that daemon is a single process with no majority vote, and its fencing (`COPY ... TO PROGRAM`) suits a development stack only. An orchestrator like **Patroni** (with etcd) or **pg_auto_failover** would bring real leader election and safer fencing.
   - MongoDB already runs as a 3-member replica set, so it tolerates the loss of one member without losing the write quorum.
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
> \*"The developed social media platform is designed as a distributed, service-oriented architecture (SOA). The presentation layer is built with Next.js 16 and React 19. Incoming HTTP and WebSocket connections are load-balanced via an Nginx reverse proxy using least-connections balancing to distribute requests across multiple stateless API Gateway instances. Communication between the edge gateway and internal business microservices (Authentication and Chat) is decoupled through RabbitMQ message-oriented middleware using asynchronous RPC queues.
>
> Cross-gateway WebSocket state and online presence are coordinated in real-time through a Redis pub/sub adapter and heartbeat-based Redis sets. Persistence employs a distributed polyglot model: relational identity management is backed by a PostgreSQL cluster with primary-standby WAL streaming replication and an automatic failover sentinel, while conversation and message history is managed by a MongoDB replica set (rs0) enforcing majority write concerns. A distributed Redis cache-aside layer is integrated across services to reduce read latency and maintain high throughput."\*
