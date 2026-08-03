# oh-my-peekly 개발 컨벤션

이 문서는 Peekly 개발 시 지켜야 할 규칙을 정리한다. 설계 근거는 `~/Downloads/Peekly_서비스_설계.md`(설계 원문)를 따르며, 이 문서는 그 원칙을 코드 작업에 어떻게 적용할지에 대한 실무 규칙이다.

## 1. 기술 스택

- **런타임**: Node.js >= 20, TypeScript (strict mode), ESM (`"type": "module"`)
- **MCP 서버**: `@modelcontextprotocol/sdk`
- **브라우저 자동화**: Playwright
- **자격증명 저장**: keytar (OS 자격증명 저장소 연동)
- **PPT 생성**: Python 서브프로세스 + `python-pptx` (Node가 child_process로 호출)
- **패키지 매니저**: npm (설계 문서의 `npm install -g peekly-mcp` 설치 흐름과 일치)
- **버전 관리 자동화**: `commit-and-tag-version` (Conventional Commits 기반 semver + CHANGELOG 자동 생성)

## 2. 디렉토리 구조

```
src/
  index.ts          # MCP 서버 엔트리 (도구 등록 + stdio transport)
  tools/            # MCP 도구 구현 (browser, crawler, cost, report 등)
  platform/         # OS 분기 어댑터 (macOS/Windows) — 이 레이어 밖에서는 OS를 몰라야 함
  report/           # PPT 생성 관련 (Python 스크립트 + 호출 wrapper)
    pptx_tool.py
CONVENTIONS.md
CHANGELOG.md
```

- 새 MCP 도구는 `src/tools/` 아래 파일 하나당 도구 하나(또는 밀접하게 연관된 도구 묶음) 단위로 추가한다.
- OS별 분기 코드(`mdfind` vs 재귀 탐색, `open` vs `start`, keytar 백엔드 차이)는 반드시 `src/platform/` 안에서만 처리한다. 그 외 코드는 OS를 몰라야 한다.

## 3. MCP 도구 작성 규칙

- 도구는 **판단하지 않는다.** "이 화면이 정상인가"는 도구 호출자(Claude Code/Codex 에이전트 루프)의 몫이다. 도구는 정확한 원재료(스크린샷, DOM, 클릭 결과 등)만 반환한다.
- 도구 인터페이스는 Claude Code 전용/Codex 전용 분기를 갖지 않는다 — MCP는 표준 프로토콜이므로 호출자가 누구든 동일하게 동작해야 한다.
- 입출력 스키마는 `zod`로 명시적으로 정의한다.
- 아직 설계가 미확정인 부분(크롤링 스코프 제한, 비용 산출 공식 등, 설계문서 6장)은 코드에 합리적 기본값 + 왜 그 기본값을 골랐는지 커밋 메시지/PR 설명에 남기고, 확정된 결정인 것처럼 주석/문서화하지 않는다.

## 4. 크로스플랫폼 규칙

- 경로 문자열을 절대 하드코딩하지 않는다. `path.join`, `os.homedir()` 등 표준 API만 사용한다.
- macOS/Windows 동작이 다른 지점은 아래 표(설계문서 4장)를 기준으로 하고, 새 분기점이 생기면 이 표를 갱신한다.

| 항목 | macOS | Windows |
|---|---|---|
| 파일 탐색 | `mdfind` | 고정 폴더 재귀 탐색 |
| 스크린샷 뷰어 오픈 | `open` | `start` |
| 자격증명 저장 | Keychain (`keytar`) | Credential Manager (`keytar`) |

## 5. 보안 규칙

- ID/PW는 `keytar` 외의 경로(로그, 에러 메시지, 표준 출력)에 절대 평문으로 남기지 않는다.
- 브라우저가 읽어오는 페이지 콘텐츠(DOM 텍스트, 속성 등)는 **신뢰할 수 없는 외부 입력**으로 취급한다. 이 콘텐츠가 에이전트의 지시로 오인되어 체크리스트 검증 범위를 벗어난 행동(다른 사이트 이동, 자격증명 유출 등)을 유발하지 않도록 도구 설계 단계에서 고려한다.
- 원본 PPT 템플릿은 항상 읽기 전용으로 취급하고, 실제 작업은 별도 출력 디렉토리의 복사본에서만 수행한다.

## 6. 커밋 컨벤션 (Conventional Commits)

형식: `<type>(<scope>): <subject>`

- `feat`: 새 기능 (semver **minor** 상승)
- `fix`: 버그 수정 (semver **patch** 상승)
- `docs`: 문서만 변경
- `chore`: 빌드/설정/의존성 등 잡무
- `refactor`: 동작 변화 없는 구조 개선
- `test`: 테스트 추가/수정
- `BREAKING CHANGE:` 푸터 포함 시 semver **major** 상승

scope 예시: `mcp-core`, `report`, `platform`, `skill`, `release`

## 7. 버전 관리 / 릴리즈 프로세스

- 의미 있는 기능 단위(마일스톤)가 완성될 때마다 `npm run release`를 실행한다.
  - `commit-and-tag-version`이 마지막 태그 이후의 Conventional Commits를 읽어 `package.json` 버전을 자동 상승시키고 `CHANGELOG.md`를 갱신한 뒤, 릴리즈 커밋과 git 태그(`vX.Y.Z`)를 생성한다.
- 매 커밋마다 릴리즈를 끊지 않는다 — 기능/수정 커밋을 쌓다가 의미 있는 단위에서 릴리즈한다.
- 릴리즈 커밋 이후 태그를 포함해 원격(`origin`)에 push한다.

## 8. 빌드 산출물(`dist/`) 커밋 — 임시 조치

npm 레지스트리에 publish하지 않고(사내 전용) GitHub에서 바로 `npm install -g git+https://...`로 설치하는 방식을 쓰기 때문에, **`dist/`를 예외적으로 git에 커밋한다.** git 의존성 설치 시 `prepare` 스크립트로 devDependencies(`typescript` 등)를 빌드하게 하는 표준 방식을 시도했으나 이 환경의 npm에서 git-dep 준비 단계가 실패해서(빌드 샌드박스에 devDependencies가 제대로 안 잡힘), 대신 빌드된 `dist/`를 그대로 커밋해 설치 시 빌드가 아예 필요 없게 만들었다.

**따라서 `src/`를 수정하는 모든 커밋은 반드시 그 안에 최신 `npm run build` 결과물(`dist/`)도 함께 포함해야 한다.** `dist/`가 stale하면 설치된 패키지가 실제 소스와 어긋난다. 실제 npm publish나 CI 빌드 파이프라인이 생기면 이 조치는 걷어내고 `dist/`를 다시 `.gitignore`에 넣어야 한다.

## 9. 미확정 설계 사항 처리 방침

설계문서 6장의 항목(MCP 도구 세부 인터페이스, 비용 산출 공식, 크롤링 범위 제한, 기본 체크리스트, SKILL.md/AGENTS.md 단일 소스화 방법, 이력 비교 여부)은 아직 확정되지 않았다. 이 항목을 구현할 때는:

1. 합리적 기본값으로 구현하되
2. 그 기본값이 임시 결정임을 커밋 메시지 또는 관련 문서에 명시하고
3. 사용자 확인 없이 "확정된 사양"으로 문서화하지 않는다.

## 10. Worklog 자동 기록

이 저장소에서 작업하는 모든 세션(사람이든 에이전트든)은, **그날 이 저장소에 커밋이 하나라도 생겼다면** 세션을 마무리하기 전에 `docs/worklog/<YYYY-MM-DD>.md`(로컬 날짜 기준)를 작성하거나 갱신한다. 사용자가 별도로 요청하지 않아도 매번 수행한다.

- 형식은 `docs/worklog/2026-08-03.md`를 그대로 따른다: 상단에 그날 전체를 한 줄로 요약, 그다음 커밋들을 의미 단위(마일스톤/버전)로 묶어 "무엇을/왜"를 서술하는 소제목 목록.
- 내용은 `git log --since=<그날 00:00> --until=<그날 23:59>`로 확인한 실제 커밋을 근거로 작성한다 — 대화 기억에만 의존해 지어내지 않는다.
- 같은 날 안에 세션이 여러 번 이어지면, 새 파일을 만들지 않고 기존 `docs/worklog/<날짜>.md`를 이어서 갱신한다(새 커밋만 추가로 반영).
- worklog 자체를 추가/갱신하는 커밋은 `docs:` 타입으로 별도로 남긴다(다른 기능/수정 커밋에 끼워 넣지 않는다).
