# Tóm tắt những gì đã thêm

Tài liệu này tóm tắt những gì đã được thêm vào dự án: đánh giá hệ thống, 11 lỗi tìm thấy khi chạy demo và cách sửa,
các thí nghiệm hiệu năng và chịu lỗi cùng số liệu, những gì chưa sửa hoặc chưa đo, và cách chạy lại.

## Mục lục

1. [Hệ thống là gì, phân tán ở đâu](#1-hệ-thống-là-gì-phân-tán-ở-đâu)
2. [11 lỗi tìm thấy khi demo và cách sửa](#2-11-lỗi-tìm-thấy-khi-demo-và-cách-sửa)
3. [Thay đổi thêm sau khi gộp `main`](#3-thay-đổi-thêm-sau-khi-gộp-main)
4. [Kết quả thực nghiệm](#4-kết-quả-thực-nghiệm)
5. [Phát hiện chưa sửa và giới hạn](#5-phát-hiện-chưa-sửa-và-giới-hạn)
6. [Cách chạy](#6-cách-chạy)
7. [Bản đồ tệp](#7-bản-đồ-tệp)

---

## 1. Hệ thống là gì, phân tán ở đâu

Ứng dụng nhắn tin (kiểu Messenger) theo kiến trúc microservice, monorepo pnpm + Turborepo.

```
Trình duyệt ── Next.js (BFF, cổng 3000)
      │
      ├── HTTP/WebSocket ──► Nginx (least_conn) ──► Gateway 8008 ┐
      │                                         └──► Gateway 8009 ┤  (NestJS, Socket.IO)
      │                                                           │
      │                                  Redis: Socket.IO adapter, presence, cache
      │                                                           │
      │                                RabbitMQ (auth_queue, chat_queue)  ← RPC
      │                                       │                  │
      │                                auth-service         chat-service
      │                                       │                  │
      │                      PostgreSQL 1 primary + 2 standby   MongoDB replica set rs0 (3 node)
      │                      + sentinel (promote)                (bầu primary tự động)
```

### Đánh giá trung thực về tính phân tán

| Nhận định                 | Thực tế trong code                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat đa instance          | **Đúng.** 2 gateway sau Nginx, tin chéo gateway đi qua Redis adapter, trạng thái online dùng chung trong Redis. Auth và chat mặc định chạy 1 bản nhưng nhân được (đã thử 2 chat-service)  |
| Microservice              | **Đúng một phần.** Tiến trình riêng, CSDL riêng, nhưng auth/chat import mã của gateway (`env.config`, `redis-cache.module`, `jwt.config`) nên còn gắn chặt về mã nguồn                    |
| RabbitMQ là message queue | **Đúng về công cụ, hẹp về vai trò.** 20 lời gọi `.send()` (yêu cầu - trả lời, RPC), 0 lời gọi `.emit()` (sự kiện). Sự kiện realtime giữa gateway đi qua Redis pub/sub, không qua RabbitMQ |
| Polyglot database         | **Đúng.** PostgreSQL (auth, user), MongoDB (hội thoại, tin nhắn), Redis (cache, pub/sub, presence)                                                                                        |
| Read-only replica         | **Có cơ chế, dùng hẹp.** Postgres chỉ đọc replica ở `findAll` người dùng; Mongo đọc theo `MONGO_READ_PREFERENCE`, hiện cấu hình `primary` nên thực tế không đọc từ replica                |
| Bầu chọn node             | **Mongo: đúng** (replica set bầu theo đa số). **Postgres: không có bầu chọn thật**, chỉ có một sentinel ping primary rồi `pg_promote()` replica theo thứ tự cố định                       |

**Điểm chết đơn còn lại:** một Redis, một RabbitMQ, một Nginx, một sentinel Postgres.
Phân tích chi tiết hơn: [../distributed_system_report.md](../distributed_system_report.md) (một số chỗ tả
presence đã cũ so với code sau sửa), [../erd.md](../erd.md), [../docs/database-replication.md](../docs/database-replication.md),
[../docs/failover-simulation.md](../docs/failover-simulation.md).

---

## 2. 11 lỗi tìm thấy khi demo và cách sửa

Hai người dùng thử (Alice ở gateway 8008, Bob ở gateway 8009) chạy chat, rồi gây sự cố từng thành phần.
Chi tiết kèm ảnh trước/sau: [LOI_PHAT_HIEN_TRONG_DEMO.md](LOI_PHAT_HIEN_TRONG_DEMO.md).

| #   | Lỗi                                                               | Nguyên nhân                                                                                                                                            | Cách sửa (tệp chính)                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Redis chết làm auth, chat và gateway sập                          | Client Redis của cache và của Socket.IO adapter không bắt lỗi; Keyv 6 không được `@nestjs/cache-manager` nhận ra nên bọc lại không có bộ lắng nghe lỗi | Kho cache "không chờ Redis" (`common/cache/redis-cache.store.ts`), gắn bộ lắng nghe lỗi (`redis-cache.module.ts`), bọc `publish` của adapter và tắt hàng đợi offline (`common/adapter/redis-io.adapter.ts`)                                                                            |
| 2   | "Tin ma": người gửi không thấy tin, nhưng tin vẫn được lưu        | Giao diện chỉ ghi console, xoá ô nhập; RabbitMQ giữ tin                                                                                                | Bong bóng "Sending...", quá 10 s thành "Not sent" + nút Retry dùng lại đúng `clientMessageId` (`ChatContainer.tsx`, `ChatArea.tsx`)                                                                                                                                                    |
| 3   | Gửi tin REST không kèm `clientMessageId` bị HTTP 500 (`E11000`)   | Chỉ mục `sparse` + `unique` coi thiếu mã là `null`                                                                                                     | Chỉ mục `unique` + `partialFilterExpression` (`message.schema.ts`); trùng thì trả tin đã lưu (`chat-service.service.ts`)                                                                                                                                                               |
| 4   | Chat-service chết thì danh sách hội thoại báo "chưa có hội thoại" | Giao diện nuốt lỗi                                                                                                                                     | Trạng thái lỗi riêng kèm nút "Try again" (`ChatSidebar.tsx`, `ChatArea.tsx`)                                                                                                                                                                                                           |
| 5   | Tắt gateway: Bob vẫn thấy Alice "Active now" mãi                  | Presence không có TTL, chỉ xoá khi socket ngắt êm                                                                                                      | Nhịp tim 10 s, quét 15 s, ngưỡng 30 s; Redis lỗi không làm từ chối socket (`presence.service.ts`, `chat.gateway.ts`)                                                                                                                                                                   |
| 6   | Đăng nhập xong bị chuyển tới `/fyp` (404)                         | Đường dẫn sai                                                                                                                                          | Đổi thành `/messages` (`login-form.tsx`, `proxy.tsx`)                                                                                                                                                                                                                                  |
| 7   | Token hết hạn thì socket không tự nối lại                         | Gateway từ chối và client không làm mới                                                                                                                | Khi bị từ chối vì token, làm mới phiên rồi nối lại (tối đa 3 lần); mọi lần làm mới đi qua một hàm chung (`ChatContainer.tsx`, `lib/api.ts`)                                                                                                                                            |
| 8   | Mongo primary chết: ghi mất khoảng 27 s                           | `directConnection=true` làm ứng dụng không đi theo primary mới                                                                                         | Mỗi mongod nghe đúng cổng nó publish, đổi tên thành viên bằng `rs.reconfig` (không xoá dữ liệu), chat-service dùng `MONGO_HOST_MAP` để phân giải tên thành viên khi chạy trên máy host (`docker-compose.yml`, `scripts/mongo-init-rs.sh`, `chat-service/src/config/mongo-host-map.ts`) |
| 9   | BFF gọi cố định gateway 8008, 8008 chết thì mọi `/api/*` trả 500  | Mặc định trỏ 8008                                                                                                                                      | Mặc định qua Nginx `http://localhost:80` (`apps/web/config/env.config.ts`)                                                                                                                                                                                                             |
| 10  | Nginx trả 502 khoảng 1,2% ở 100 kết nối đồng thời                 | Mở kết nối mới tới host cho từng yêu cầu                                                                                                               | `keepalive 64`, `proxy_connect_timeout 3s` (`nginx.conf`)                                                                                                                                                                                                                              |
| 11  | Cache tin nhắn cũ tối đa 60 s với `limit` khác 100                | Chỉ huỷ khoá cache của `limit=100`                                                                                                                     | Chỉ cache trang mặc định (`chat-service.service.ts`)                                                                                                                                                                                                                                   |

Kèm theo là các test mới (cache, chỉ mục, idempotency, presence, gateway) và sửa script `pnpm --filter api dev`
theo dõi nhầm thư mục `dist` nên gateway 8009 không tự khởi động lại.

---

## 3. Thay đổi thêm sau khi gộp `main`

Đã gộp `main` (commit `4e7d6bf`, bộ dò topology cho Postgres/Mongo). Các quyết định khi giải xung đột:

- **Mongo:** giữ cách driver tự theo primary mới (`mongo.config.ts`). Bộ dò `mongo-topology.resolver.ts` của `main` chỉ chọn
  primary **một lần lúc khởi động** nên chưa giải quyết lỗi 8 lúc đang chạy. Tệp của `main` vẫn còn nhưng Mongo không dùng.
- **Token socket:** theo `main` (bỏ route `/api/auth/token`, socket xác thực bằng cookie lúc bắt tay); giữ phần tự nối lại của lỗi 7.
  Hệ quả: người dùng thứ hai phải dùng **trình duyệt khác nhưng cùng host `localhost`**, vì cookie gắn theo tên host.
- **Lỗi trên `main` đã sửa:** `postgresConfig` thành hàm bất đồng bộ nhưng `postgres-database.module.ts` vẫn dùng
  `configService.get('postgres')` (một Promise) nên auth-service chết với `MissingDriverError`. Nay inject `postgresConfig.KEY`.
  Spec `database-replication.spec.ts` cũng được cập nhật cho khớp.
- **Auth tự theo Postgres primary mới:** `postgres-topology-watcher.ts` dò lại primary mỗi 5 s và kết nối lại khi đổi
  (có 3 test; **chưa thử với Postgres chết thật**).
- CORS của gateway do `main` thu hẹp (`localhost:3000/80/8080`) được giữ nguyên.

---

## 4. Kết quả thực nghiệm

Điều kiện: toàn bộ chạy trên **một máy** (Windows, Docker Desktop), client đo chạy cùng máy với server nên số tuyệt đối
chỉ mang tính tham khảo. Mỗi cấu hình đo 3 lần và lấy trung bình. Số liệu thô: [ket-qua/](ket-qua/).
Công cụ: script Node trong [scripts/](scripts/).

### 4.1 Tải WebSocket (`p1_ws_load.mjs`)

Một hội thoại chung, mỗi tin phát cho mọi socket. Mọi mức **nhận đủ 100%, 0 lỗi ack**.

| Kiểu tải                | Socket | p50 (ms) | p95 (ms) | p99 (ms) | Tin/giây |
| ----------------------- | ------ | -------- | -------- | -------- | -------- |
| 1 người gửi 5 tin/s     | 50     | 15,3     | 31,1     | 45,7     | 4,9      |
|                         | 100    | 16,1     | 22,3     | 39,3     | 4,9      |
|                         | 250    | 19,1     | 27,4     | 49,3     | 4,9      |
|                         | 500    | 24,0     | 35,3     | 47,1     | 4,9      |
| Mọi người gửi 0,2 tin/s | 50     | 15,8     | 25,7     | 50,4     | 10       |
|                         | 100    | 16,9     | 25,4     | 35,4     | 20       |
|                         | 250    | 26,4     | 56,6     | 77,1     | 50       |
|                         | 500    | 121,1    | 307,8    | 427,5    | 100      |

Điểm gập: 500 người cùng gửi (mỗi tin phát cho 500 socket) làm p95 vọt từ 57 ms lên 308 ms.

### 4.2 Thí nghiệm mở rộng (`run_p2_scale.sh`)

500 socket, mọi người gửi 0,2 tin/s, nhận đủ 100% ở mọi cấu hình.

| Chat-service | Gateway | p50 (ms) | p95 (ms) | p99 (ms) |
| ------------ | ------- | -------- | -------- | -------- |
| 1            | 1       | 2.011    | 3.344    | 3.735    |
| 1            | 2       | 99       | 220      | 289      |
| 2            | 1       | 774      | 1.464    | 1.722    |
| 2            | 2       | 84       | 174      | 215      |

Gateway là nút cổ chai chính (phát tin tới 500 socket): thêm gateway thứ hai giảm p95 khoảng 15 lần; thêm
chat-service thứ hai giảm tiếp.

### 4.3 Chạy dài 30 phút và tài nguyên (`run_p7_soak.sh`)

100 socket, 20 tin/s, 30 cửa sổ × 55 s. Nhận đủ **100%** ở cả 30 cửa sổ, 0 lỗi.

- Độ trễ **không tăng theo thời gian**: p95 31,2 ms (5 cửa sổ đầu) so với 32,5 ms (5 cửa sổ cuối); tệ nhất 48 ms.
- RAM không rò rỉ: auth-service 112 → 113 MB; chat-service 271 → 255 MB; gateway 130–170 MB.
- CPU: mỗi node Mongo trung bình 15–18% (đỉnh 63–73%); Redis 0,6%; RabbitMQ 1,5%; Nginx gần 0.
  Mongo tốn nhất vì mọi tin ghi `w: majority` ra 3 node.
- Một lần chạy dài trước đó bị hỏng vì lỗi của kịch bản đo (xem 4.5); dữ liệu được giữ ở
  `p7_soak_cum_mongo_2_of_3.csv` như một kết quả riêng.

### 4.4 Mô phỏng lỗi (chạy lại sau khi sửa và gộp `main`)

| Kịch bản                                               | Cách gây lỗi                | Kết quả                                                                                                                      |
| ------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tắt gateway 8008 đang chat (`f1_gateway_kill.mjs`)     | Kill tiến trình             | Phát hiện 3 ms, nối lại sang 8009 sau 163 ms, 84/84 tin lưu, nhận đủ, 0 mất, 0 trùng                                         |
| Hai chat-service, tắt một (`f2_f3_chat_service.mjs`)   | Kill một bản                | 73/73 tin an toàn, không lỗi                                                                                                 |
| Tắt cả chat-service                                    | Kill hết                    | Client nhận "Message service timeout" đúng 10 s; tin được lưu khi chat-service về; giao diện hiện "Not sent" + Retry         |
| Redis chết 12 s (`f4_f6_infra.mjs redis`)              | Kill container              | 0/53 mẫu lỗi; mọi dịch vụ sống; cache tự dùng lại khi Redis lên                                                              |
| Trạng thái online khi gateway chết (`f5_presence.mjs`) | Kill cứng 8008              | Bob thấy Alice offline sau khoảng 31–40 s (trước: không bao giờ)                                                             |
| RabbitMQ chết 12 s                                     | Kill container              | Mọi thao tác lỗi ngay, tự phục hồi khoảng 7–8 s                                                                              |
| Mongo primary chết 40 s                                | Kill container              | Bầu primary mới khoảng 10–12 s, chỉ 1/78 mẫu lỗi rồi hồi phục                                                                |
| Ngắt mạng Mongo primary 30 s (`mongo-net`)             | `docker network disconnect` | Hai node còn lại bầu primary mới; node bị cô lập tự hạ xuống SECONDARY khi nối lại, **không có hai primary**; 1–2/25 mẫu lỗi |
| Ngắt mạng Redis 12 s (`redis-net`)                     | Như trên                    | 0–2/19 mẫu lỗi, gateway sống                                                                                                 |
| Ngắt mạng RabbitMQ 12 s (`rabbitmq-net`)               | Như trên                    | Trước khi sửa: **chat-service chết** (xem mục 5). Sau khi sửa: chat-service sống và tự nhận việc lại                         |
| Một gateway so với qua Nginx                           | Tải REST                    | Một gateway ≈ 3.500–3.800 yêu cầu/giây; qua Nginx sau sửa 11.467 yêu cầu/5 s, 0 lỗi                                          |
| Cache bật/tắt                                          | Tải REST 50 kết nối         | 996 so với 145 yêu cầu/giây (≈ 6,9 lần)                                                                                      |

### 4.5 Bài học từ một kịch bản đo hỏng

Nối lại container bằng `docker network connect` làm **mất bí danh mạng** (`mongo_primary`, `redis`, `rabbitmq`),
nên node Mongo khác không tìm thấy `mongo_primary` và cụm chỉ còn 2/3 node khoẻ: ghi `w: majority` quá hạn liên tục,
tin tới đủ chỉ còn 61% và có hơn 8.500 lỗi. Script đã sửa để nối lại với `--alias`. Kết quả cũng cho thấy cụm Mongo
mất 1/3 node thì thông lượng ghi sụp mạnh.

### 4.6 Lỗi giữa lúc tải lớn (`run_p8_faults_under_load.sh`)

250 socket tự nối lại, mọi người gửi 0,2 tin/s trong 60 s; lỗi gây ở giây 20 và khôi phục ở giây 35.

| Lỗi                                   | Nhận đủ | Lỗi ack | p95 (ms) | Ghi chú                                   |
| ------------------------------------- | ------- | ------- | -------- | ----------------------------------------- |
| Không lỗi (đối chứng)                 | 100%    | 0       | 87       |                                           |
| Tắt gateway 8009                      | 80%     | 275     | 3.762    | 125 socket tự nối lại                     |
| Tắt chat-service                      | 83,8%   | 488     | 8.144    | Ack quá hạn 10 s                          |
| Redis chết 15 s                       | 83,1%   | 0       | 45       | Tin chéo gateway mất trong lúc Redis chết |
| RabbitMQ chết 15 s, **trước khi sửa** | 42,6%   | 1.617   | 42       | Chat-service thoát tiến trình             |
| RabbitMQ chết 15 s, sau khi sửa       | 66,6%   | 1.001   | 44       | Chat-service sống                         |
| Ngắt mạng RabbitMQ 15 s, sau khi sửa  | 70,5%   | 885     | 45       | Chat-service sống                         |
| Mongo primary chết 15 s               | 94,7%   | 160     | 8.070    | Ghi quá hạn trong lúc bầu primary         |

### 4.7 Đọc replica (`run_p3_read_replica.sh`)

Đọc tin nhắn bỏ qua cache (mỗi yêu cầu một `limit` khác), 50 kết nối, 6 lần mỗi chế độ: `primary` 56 yêu cầu/s (p95 2.222 ms),
`secondaryPreferred` 57 yêu cầu/s (p95 2.282 ms). **Không có khác biệt về thông lượng**: nút cổ chai là chat-service và gateway
(đọc và tuần tự hoá khoảng 1.500 tin mỗi yêu cầu), không phải Mongo (CPU mỗi node 6–18%). `secondaryPreferred` chỉ dàn tải
đều ra ba node.

### 4.8 Mạng chậm và mất gói (`run_p9_netem.sh`)

Dùng `tc netem` qua một container phụ chung mạng với từng thành phần (`netem.sh`), nên không phải sửa cấu hình ứng dụng.
100 socket, 20 tin/s, 40 s; chèn độ trễ 100 ms hoặc mất gói 5% vào một thành phần mỗi lần. **Tin tới đủ 100% và 0 lỗi ack ở mọi trường hợp**:
hệ thống suy giảm về độ trễ chứ không mất tin.

| Thành phần    | Tác động   | p50 (ms) | p95 (ms) | p99 (ms) |
| ------------- | ---------- | -------- | -------- | -------- |
| (đối chứng)   | không      | 16       | 23       | 38       |
| Redis         | trễ 100 ms | 214      | 247      | 264      |
| Redis         | mất gói 5% | 16       | 66       | 165      |
| RabbitMQ      | trễ 100 ms | 217      | 253      | 262      |
| RabbitMQ      | mất gói 5% | 16       | 79       | 235      |
| Mongo primary | trễ 100 ms | 691      | 721      | 757      |
| Mongo primary | mất gói 5% | 28       | 390      | 518      |

Trễ một chiều 100 ms cộng khoảng 200 ms (một vòng đi về) cho Redis và RabbitMQ, nhưng khoảng 700 ms cho Mongo vì mỗi lần ghi
`w: majority` cần nhiều vòng đi về giữa các node.

---

## 5. Phát hiện chưa sửa và giới hạn

1. **Chat-service chết khi RabbitMQ chết hoặc bị ngắt mạng (ĐÃ SỬA).** Nest gửi trả lời RPC mà không chờ kết quả; khi broker biến mất
   đúng lúc đó, lời hứa bị từ chối với `Error: channel closed` mà không ai xử lý nên Node thoát tiến trình (auth-service chết hoặc
   sống tuỳ thời điểm). Sửa bằng `common/rmq-rejection-guard.ts` (cài ở `main.ts` của chat-service và auth-service): ghi log các
   lỗi mất kết nối broker và chạy tiếp; mọi lỗi chưa xử lý khác vẫn dừng tiến trình. Đã kiểm chứng bằng cách chạy lại hai kịch
   bản (chết và ngắt mạng RabbitMQ) dưới tải 250 socket: chat-service sống và tự nhận việc lại.
2. **Sau failover Postgres, các standby không tự bám theo primary mới.** Các replication slot (`auth_replica`, `auth_replica_2`)
   chỉ có trên primary cũ; primary mới (node được `pg_promote()`) không có nên cả hai standby báo `replication slot ... does not exist`
   và ngừng nhận dữ liệu. Sửa tay (không mất dữ liệu): tạo hai slot trên primary mới; một standby (primary cũ sau khi bật lại) bám lại
   được; standby còn lại vẫn trỏ `host=postgres_primary` nên phải đổi `primary_conninfo`, và nếu WAL cần đã bị dọn (đã xảy ra) thì phải
   dựng lại bằng `pg_basebackup` (xoá và nhân bản lại dữ liệu của node đó). Hệ quả: sau một lần failover, cụm chỉ còn một primary sống.
3. **Sentinel Postgres chỉ failover được một lần.** Nó theo dõi cố định host `postgres_primary`; sau lần failover đầu không còn failover
   lần hai. Nếu sentinel chỉ mất mạng tới primary (primary vẫn sống) thì có thể sinh hai primary (split-brain). Sentinel cũng là một điểm
   chết đơn. Vai trò node sau failover: primary chuyển sang `postgres_replica` (cổng 5433), `auth_postgres` (5432) thành standby.
4. **Cookie gắn theo host:** hai người dùng cùng trên một máy phải dùng hai trình duyệt (hoặc cửa sổ riêng tư) cùng `localhost`.
5. **Hạ tầng cùng một máy**, ứng dụng chưa đóng gói Docker (không có Dockerfile), không có mạng thật giữa các nút.
6. 7 tệp spec dựng sẵn của auth-service và chat-service vẫn lỗi (lệch dependency injection), có từ trước, chưa sửa.
7. Chưa đo: chia cắt mạng của Postgres, nhiều lần failover liên tiếp, cụm Postgres sau khi dựng lại standby.

---

## 6. Cách chạy

Yêu cầu: Node 20+, pnpm 10.4.1 (dùng `pnpm.cmd` nếu PowerShell chặn `pnpm.ps1`), Docker Desktop. Cần tệp `.env` ở thư mục
gốc (không có trong git) với các biến: `DATABASE_URL`, `DATABASE_REPLICA_URL`, `DATABASE_REPLICA_2_URL`, `MONGO_URI`
(liệt kê 3 host `localhost:27017,27018,27019`), `MONGO_REPLICA_SET=rs0`, `MONGO_HOST_MAP`, `MONGO_READ_PREFERENCE`,
`RABBITMQ_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_JWT_SECRET`, `REFRESH_JWT_EXPIRES_IN`.
Ý nghĩa từng biến xem `apps/api/apps/api/src/config/env.config.ts` và [../docs/database-replication.md](../docs/database-replication.md).

```powershell
docker compose up -d
docker compose ps                      # đợi mọi container healthy
pnpm.cmd --filter api dev              # terminal 1: 2 gateway, auth-service, chat-service
pnpm.cmd --filter web dev              # terminal 2: web ở http://localhost:3000
```

Mở hai trình duyệt khác nhau (hoặc một cửa sổ riêng tư) cùng vào `http://localhost:3000`, đăng nhập hai tài khoản thử,
bấm **GW 1 (:8008)** cho người thứ nhất và **GW 2 (:8009)** cho người thứ hai.

Chạy lại các kịch bản từ thư mục gốc (mỗi lệnh in kết quả JSON; các kịch bản gây lỗi tắt hoặc ngắt thật container hay tiến trình,
nên chạy từng cái một và kiểm tra hệ thống đã về bình thường trước khi chạy tiếp):

| Kịch bản                                 | Lệnh                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Nhắn chéo gateway                        | `node report/scripts/e0_baseline.mjs 20`                                                        |
| Tắt một gateway đang chat                | `node report/scripts/f1_gateway_kill.mjs`                                                       |
| Chat-service chết (hai bản, rồi tắt hết) | `node report/scripts/f2_f3_chat_service.mjs`                                                    |
| Redis, RabbitMQ, Mongo chết              | `node report/scripts/f4_f6_infra.mjs redis` (hoặc `rabbitmq`, `mongo 40000`)                    |
| Ngắt mạng Redis, RabbitMQ, Mongo         | `node report/scripts/f4_f6_infra.mjs redis-net` (hoặc `rabbitmq-net`, `mongo-net 30000`)        |
| Trạng thái online khi gateway chết       | `node report/scripts/f5_presence.mjs` (đóng tab trình duyệt của người bị theo dõi trước)        |
| Tải WebSocket                            | `node report/scripts/p1_ws_load.mjs senders 250 20` hoặc `bash report/scripts/run_p1_matrix.sh` |
| Mở rộng 1 so với 2 gateway, chat-service | `bash report/scripts/run_p2_scale.sh`                                                           |
| Chạy dài 30 phút kèm CPU/RAM             | `bash report/scripts/run_p7_soak.sh`                                                            |

Các bài tải tạo nhiều tin có tiền tố `load-` trong MongoDB; xoá chúng sau khi đo (chỉ theo tiền tố đó).
Lưu ý: nếu RabbitMQ đếm được nhiều hơn 1 bản nhận việc cho `auth_queue` hoặc `chat_queue` thì còn tiến trình dư từ lần
chạy trước; dừng hết rồi chạy lại backend, nếu không kết quả đo sẽ lệch (ví dụ token sống lúc 40 s lúc 900 s).

---

## 7. Bản đồ tệp

| Đường dẫn                                                                                  | Nội dung                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [LOI_PHAT_HIEN_TRONG_DEMO.md](LOI_PHAT_HIEN_TRONG_DEMO.md)                                 | 11 lỗi, ảnh trước và sau khi sửa                                                        |
| [ket-qua/](ket-qua/)                                                                       | CSV: `p1_ws_load`, `p2_scale`, `p6_resources`, `p7_soak` (và hai bản của lần đo hỏng)   |
| [images/](images/)                                                                         | Ảnh chụp giao diện trước và sau khi sửa                                                 |
| [scripts/](scripts/)                                                                       | Script đo: tải (`p1_*`, `run_p*`), lỗi (`f1`–`f7`), tài nguyên (`sample_resources.mjs`) |
| [../docs/](../docs/)                                                                       | Tài liệu replication và mô phỏng failover của nhóm                                      |
| [../distributed_system_report.md](../distributed_system_report.md), [../erd.md](../erd.md) | Báo cáo kiến trúc và thiết kế CSDL của nhóm                                             |
