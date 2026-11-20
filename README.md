# FBG Cooperation Dashboard_v1.0

물류/발주팀 · 브랜드팀 · 디자인팀이 **하나의 웹 주소, 하나의 중앙 DB**에서 제품 정보와 업무 진행 상황을 공유하는 웹 애플리케이션입니다.

```
물류/발주팀 제품 등록 → 디자인팀 패키지 디자인 → 브랜드팀 신제품 확인·촬영 요청
→ 디자인팀 촬영 → 브랜드팀 상세페이지 등 디자인 요청 → 디자인팀 제작 완료 → 브랜드팀 론칭 준비 확인
```

| 구성 | 사용 기술 |
|---|---|
| 프론트엔드 | HTML / CSS / JavaScript (빌드 불필요, 정적 파일) |
| 데이터베이스 | Supabase PostgreSQL (중앙 DB) |
| 로그인·권한 | Supabase Auth + Row Level Security(RLS) + DB 트리거 |
| 파일 저장 | Supabase Storage (비공개 버킷, 로그인한 팀원만 열람) |
| 실시간 반영 | Supabase Realtime (다른 PC의 변경이 즉시 반영) |
| 호스팅 | Netlify / Vercel / GitHub Pages 등 정적 호스팅 아무 곳 |

> **현재 상태:** 소스 코드와 DB 구조는 완성되어 있고, 서버 없는 **체험 모드**(`index.html?demo=1`)로 화면과 업무 흐름을 확인했습니다.
> **실제 Supabase 프로젝트 연결과 배포는 아직 하지 않았습니다.** 아래 1~3단계(약 20분)를 진행해야 여러 PC 간 공유가 가능해지며, 그 전까지는 "공유 기능 완료"가 아닙니다.

---

## 폴더 구조

```
workflow-dashboard/
├── index.html              진입점
├── css/app.css             Apple 스타일 UI
├── js/
│   ├── config.js           ★ Supabase URL / anon key 입력 (사용자 설정)
│   ├── config.example.js
│   ├── app.js              로그인, 레이아웃, 라우팅, 실시간 동기화, 알림
│   ├── views.js            01 대시보드 · 02~04 요청 목록 · 05 제품 관리 · 관리자 화면
│   ├── detail.js           업무/제품 상세 (디자인팀 처리, 첨부, 댓글, 이력, 론칭 준비)
│   ├── forms.js            요청서 / 제품 등록 폼, 임시저장
│   ├── store.js            공유 상태, 권한 판별(화면용)
│   ├── db.js               Supabase 연결 + 체험 모드
│   ├── constants.js        ★ 카테고리별 사양 항목, 옵션 목록 (확장 시 수정)
│   └── ui.js
└── supabase/
    ├── schema.sql          ★ DB 테이블·권한·트리거·저장소·실시간 설정 (1회 실행)
    └── reset.sql           개발 중 초기화용
```

---

## 1. Supabase 설정 (사용자 작업 필요)

1. <https://supabase.com> 가입 → **New project** 생성
   - Region: `Northeast Asia (Seoul)` 권장
   - Database Password는 안전한 곳에 보관 (앱에는 넣지 않습니다)
2. 왼쪽 메뉴 **SQL Editor** → New query → `supabase/schema.sql` 전체를 붙여넣고 **Run**
   - "Success. No rows returned" 가 나오면 완료입니다.
3. **Authentication → Sign In / Providers → Email** 이 켜져 있는지 확인
   - 사내 전용이라면 *Confirm email* 을 꺼도 됩니다(가입 즉시 로그인). 켜 두면 가입 시 확인 메일이 발송됩니다.
4. **Project Settings → API** 에서 두 값을 복사해 `js/config.js` 에 입력

   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',   // anon / public 키
   };
   ```

   - `anon` 키는 브라우저에 공개되도록 설계된 키이며, 실제 접근 권한은 DB의 RLS 정책이 검증합니다.
   - **`service_role` 키는 절대 config.js 나 어떤 프론트엔드 파일에도 넣지 마세요.**

## 2. 첫 관리자 계정 만들기

1. 사이트에 접속 → **계정 만들기** → 이름/이메일/비밀번호 입력
2. **가장 먼저 가입한 계정이 자동으로 관리자**가 됩니다. (배포 직후 담당자가 먼저 가입하세요)
3. 이후 가입한 팀원은 `승인 대기` 상태로 아무 데이터도 볼 수 없습니다.
   관리자가 **사용자 · 설정** 메뉴에서 소속 팀(물류/발주팀 · 브랜드팀 · 디자인팀 · 관리자)을 지정하면 바로 이용할 수 있습니다.

> 관리자를 수동으로 지정하려면 SQL Editor 에서:
> `update public.profiles set role = 'admin' where email = '이메일';`

## 3. 배포 (여러 PC에서 URL로 접속)

정적 파일이므로 아래 중 하나를 사용하면 됩니다.

- **Netlify Drop (가장 간단):** <https://app.netlify.com/drop> 에 `workflow-dashboard` 폴더를 끌어다 놓기 → 발급된 `https://xxxx.netlify.app` 주소 공유
- **Vercel:** GitHub 저장소에 올린 뒤 Import → Framework `Other`, 빌드 명령 없음
- **GitHub Pages:** 저장소 Settings → Pages → 브랜치 지정

> **코드를 수정해 다시 배포할 때마다** 먼저 `python3 tools/stamp-version.py` 를 실행하세요. 파일 참조에 버전이 붙어, 브라우저 캐시 때문에 옛 파일과 새 파일이 섞이는 문제를 막습니다.

배포 후 Supabase **Authentication → URL Configuration** 에서
- *Site URL* 을 배포 주소로 변경
- *Redirect URLs* 에 배포 주소 추가 (비밀번호 재설정 메일 링크용)

로컬에서 확인하려면 폴더에서 `python3 -m http.server 5173` 실행 후 <http://localhost:5173> 접속 (파일을 더블클릭해서 열면 모듈 로딩이 차단됩니다).

---

## 화면 구성

| 메뉴 | 내용 |
|---|---|
| 01 통합 대시보드 | KPI 6종(클릭 시 해당 업무만 필터), 부서별·담당자별·유형별 현황, 우선순위 높은 작업, 완료 예정 임박, 최근 신제품/리뉴얼, 최근 변경 |
| 02 패키지 디자인 요청 | 물류/발주팀: 신규 제품 등록+요청 동시 작성(유형 여러 개 선택 시 유형별 업무 자동 분리), 카테고리별 상세 사양·옵션별 사양·리뉴얼 변경사항 |
| 03 촬영 요청 | 브랜드팀: 제품 선택 시 사양·옵션·이미지 자동 표시(수정 불가, "정보 오류 수정 요청" 가능), 진행 중 중복 업무 안내 |
| 04 디자인 작업 요청 | 브랜드팀: 작업 유형 복수 선택, 사용 위치 복수 선택, 촬영 요청과 연결, 신규 유형 추가 |
| 05 제품 통합 관리 | 제품별 패키지/촬영/상세페이지/썸네일 진행 현황, 필요 여부, 론칭 예정일·준비 상태(브랜드팀 관리), 연결 업무, 댓글, 이력 |
| 사용자 · 설정 | (관리자) 권한 지정, 계정 비활성화, 브랜드·작업 유형 관리 |

공통: 검색·필터(브랜드/카테고리/유형/담당자/요청자/상태/우선순위/요청일 기간), 정렬(최근 요청·희망 완료일·우선순위), 엑셀 다운로드(현재 필터 반영), 업무별 댓글, 변경 이력(누가·언제·무엇을 → 어떻게), 서버 임시저장, 앱 내 알림(신규 요청·상태 변경·완료·담당 배정·기한 초과).

## 권한 (DB에서 최종 검증)

| 기능 | 물류/발주 | 브랜드 | 디자인 | 관리자 |
|---|---|---|---|---|
| 전체 업무 조회 | ✔ | ✔ | ✔ | ✔ |
| 제품 등록/수정 | ✔ | 조회 | 조회 | ✔ |
| 패키지 디자인 요청 작성·수정·취소 | ✔ | 조회 | 조회 | ✔ |
| 촬영 / 디자인 작업 요청 작성·수정·취소 | 조회 | ✔ | 조회 | ✔ |
| 담당자·상태·일정·결과물·작업 메모 | 조회 | 조회 | ✔ | ✔ |
| 론칭 준비 상태 관리 | 조회 | ✔ | 조회 | ✔ |
| 업무/제품 삭제, 사용자 관리 | ✗ | ✗ | ✗ | ✔ |

- 화면에서 버튼을 숨기는 것과 별개로, **RLS 정책 + `guard_request` 트리거가 컬럼 단위로 권한을 검사**합니다. 브라우저 개발자도구로 API를 직접 호출해도 거부됩니다.
- 일반 팀원은 삭제 대신 **요청 취소**(기록 유지)를 사용합니다.
- 첨부파일은 비공개 버킷에 저장되고, 로그인한 승인 사용자에게만 6시간짜리 서명 URL로 제공됩니다.

---

## 4. 검수 시나리오 실행 방법

PC 3대(또는 브라우저 3개: Chrome / Safari / 시크릿 창)에 각각 다른 팀 계정으로 로그인합니다.

| Test | 방법 | 기대 결과 |
|---|---|---|
| 01 PC 간 공유 | A(물류) 패키지 요청 등록 → B(브랜드) 02 탭 확인 → C(디자인) 상태 `작업중` 저장 | A·B 화면이 새로고침 없이 `작업중`으로 바뀜 (우상단 "실시간 연결됨") |
| 02 제품 정보 연동 | A가 테이블 카테고리 사양 입력 → B가 촬영 요청에서 해당 제품 선택 | 사양·옵션·이미지·입고일 자동 표시 |
| 03 디자인 요청 처리 | B가 기획안 URL(Figma) 포함 디자인 요청 → C가 담당자·상태 변경 | B 화면에 담당자/상태 반영, 알림 수신 |
| 04 첨부파일 | A가 제품 이미지 업로드 → B 조회 → C 파일명 클릭 다운로드 → 브라우저 재접속 | 모두 열람 가능, 재접속 후 유지 |
| 05 권한 | 아래 콘솔 테스트 실행 | 모두 오류(거부) |
| 06 영속성 | 새로고침 / 로그아웃 후 재로그인 / 다른 브라우저 | 데이터 유지 |
| 07 동시 작업 | 여러 명이 동시에 상태 변경·댓글 작성 | 모든 화면에 최신 내용 반영, 상세 화면에서 입력 중이면 "최신 내용 보기" 안내 |

**Test 05 — 직접 데이터 접근 차단 확인.** 물류/발주팀 계정으로 로그인한 상태에서 브라우저 개발자도구(F12) → Console 에 붙여넣기:

```js
const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm');
const sb = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
// 1) 브랜드팀 촬영 요청 수정 시도 → 0건 수정 또는 오류
console.log(await sb.from('shoot_requests').update({ request_note: 'hack' }).neq('id', '00000000-0000-0000-0000-000000000000').select());
// 2) 디자인팀 전용 항목(상태) 변경 시도 → "담당자와 진행 상태는 디자인팀만 변경할 수 있습니다"
console.log(await sb.from('package_requests').update({ status: '완료' }).neq('id', '00000000-0000-0000-0000-000000000000').select());
// 3) 본인 권한을 관리자로 변경 시도 → "역할과 계정 상태는 관리자만 변경할 수 있습니다"
const { data: { user } } = await sb.auth.getUser();
console.log(await sb.from('profiles').update({ role: 'admin' }).eq('id', user.id).select());
```

디자인팀 계정으로는 `products` 수정, `package_requests` 의 `required_text` 수정을 시도해 거부되는지 확인합니다.

---

## 슬랙 DM 알림

대시보드의 🔔 알림(신규 요청, 작업 상태 변경·완료, 담당자 배정, 멘션, 정보 수정 요청)이 받는 사람에게 슬랙 DM으로도 전송됩니다.

구조: `notifications` 테이블 INSERT → DB 트리거(pg_net) → Edge Function `slack-notify` → 슬랙 `chat.postMessage`

1. **슬랙 앱 만들기 (슬랙 워크스페이스 관리자)** — https://api.slack.com/apps → Create New App → From an app manifest → 워크스페이스 선택 → `supabase/functions/slack-notify/slack-app-manifest.json` 내용 붙여넣기 → Create → Install to Workspace
2. **봇 토큰 저장** — 슬랙 앱 OAuth & Permissions 의 `Bot User OAuth Token`(xoxb-…)을 복사해 Supabase → Edge Functions → Secrets 에 `SLACK_BOT_TOKEN` 으로 저장 (채팅·코드에 붙여넣지 마세요)
3. **Edge Function 배포** — `supabase/functions/slack-notify/index.ts` 를 Supabase → Edge Functions 에서 이름 `slack-notify` 로 배포, Settings 에서 *Verify JWT* 끄기 (함수는 알림 id 만 받고 내용은 DB에서 다시 읽으며, 같은 알림은 한 번만 보냅니다)
4. **트리거** — `migration_2026-11-19_v1.4.sql` 실행 (새 프로젝트는 schema.sql 끝부분의 함수 URL 을 본인 프로젝트로 수정)

- 사람 연결: 첫 알림 때 대시보드 가입 이메일로 슬랙 계정을 자동으로 찾습니다. 이메일이 다르면 관리자 화면 「슬랙 DM」 칸에 슬랙 멤버 ID(U…)를 입력하세요. 「받기」 체크를 해제하면 해당 사용자에게 DM을 보내지 않습니다.
- 문제 확인: `select id, title, slack_sent_at, slack_error from notifications order by id desc limit 20;` 또는 Edge Functions → slack-notify → Logs

## 5. 운영 가이드

- **카테고리 추가/사양 항목 변경:** `js/constants.js` 의 `CATEGORY_SPECS` 에 항목 추가 → 재배포. 사양은 JSON 으로 저장되므로 DB 변경이 필요 없습니다.
- **브랜드, 디자인 작업 유형:** 관리자 화면에서 추가 (작업 유형은 브랜드팀도 요청서에서 추가 가능)
- **댓글 멘션:** 협업 댓글에서 `@`를 입력하면 사람·팀 목록이 뜹니다. 멘션된 사람(또는 팀 전체)에게 🔔 알림이 DB 트리거로 생성됩니다.
- **패치노트(06 탭):** 업데이트할 때마다 `js/patchnotes.js` 맨 위에 버전·날짜·항목(신규/수정/보완)을 추가하고 재배포합니다. 모든 사용자가 볼 수 있고, 새 버전이 올라오면 메뉴에 N 표시가 뜹니다.
- **사용자 삭제:** 관리자 화면 「사용자 및 권한」 표의 「삭제」. 로그인 계정은 삭제되고, 작성한 요청·댓글·이력의 이름은 남습니다. 같은 이메일로 다시 가입할 수 있습니다.
- **업데이트 마이그레이션:** 기존 프로젝트를 업데이트할 때는 `supabase/migration_*.sql` 을 날짜 순서대로 한 번씩 실행합니다 (2026-11-17 v1.0 → 2026-11-18 v1.1 → 2026-11-18 v1.2 → 2026-11-19 v1.3 → 2026-11-19 v1.4 → 2026-11-19 v1.5 → 2026-11-19 v1.6 → 2026-11-19 v1.8 → 2026-11-19 v1.9 → 2026-11-19 v1.11 → 2026-11-20 v1.17 → 2026-11-20 v1.19 → 2026-11-20 v1.20 → 2026-11-20 v1.21). 새 프로젝트는 `schema.sql` 만 실행하면 됩니다.
- **세부 사양 저장 형식:** 단일 옵션은 `specs = {항목: 값}`, 다중 옵션은 `specs = {option_mode: 'multi', variants: [{name, 항목: 값}]}`. 다중 패키지 규격은 한 줄에 하나씩 `[패키지명] 규격` 으로 저장됩니다.
- **백업:** Supabase 유료 플랜은 매일 자동 백업이 제공됩니다. 무료 플랜이라면 주기적으로 `Database → Backups` 또는 `pg_dump` 로 백업하세요. 엑셀 다운로드로 업무 목록을 보관할 수도 있습니다.
- **무료 플랜 유의:** 7일간 접속이 없으면 프로젝트가 일시 정지될 수 있습니다(대시보드에서 재개). 상시 운영이면 Pro 플랜을 권장합니다.
- **데이터 규모:** 화면은 전체 업무를 한 번에 불러와 필터링합니다. 업무가 수만 건 이상으로 늘면 서버 측 페이지네이션 전환을 검토하세요.

## 6. 구현 범위

- Phase 1 (필수) — 전부 구현: 로그인, 중앙 DB, 제품 등록/수정, 요청 3종, 파일 첨부, 상태 관리, 팀별 권한(DB 검증), 실시간 동기화
- Phase 2 (운영 효율화) — 전부 구현: KPI, 제품 통합 관리, 후속 업무 연동, 검색/필터, 댓글, 변경 이력, 론칭 준비 현황, 앱 내 알림
- Phase 3 (고도화) — 엑셀 다운로드, 사양 변경 비교, 중복 요청 안내 구현 / **캘린더, 외부 알림(이메일·메신저), 부서별 성과 통계는 미구현**

## 체험 모드

`index.html?demo=1` — 서버 없이 샘플 데이터로 화면과 흐름을 미리 볼 수 있습니다. 데이터는 **해당 브라우저에만** 저장되므로 운영에 사용하지 마세요.
