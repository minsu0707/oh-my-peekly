# oh-my-peekly

서비스 URL, 로그인 계정, 테스트결과서(PPT) 양식만 주면 Claude Code가 직접 웹 서비스를 돌아다니며 QA 테스트를 수행하고, 발견한 이슈를 사용자 검수(Y/N) 후 계정별 PPT 보고서로 만들어주는 MCP 서버 + 스킬입니다.

> 현재 **Claude Code 전용**으로 설치·검증되어 있습니다. Codex 지원은 이후 단계입니다 (아래 "알려진 제약" 참고).
> 사내 전용 도구라 npm 레지스트리에 올리지 않고, 이 GitHub 저장소에서 직접 설치합니다.

## 사전 준비물

설치를 시작하기 전에 아래 4가지가 컴퓨터에 준비되어 있어야 합니다. 이미 개발 환경을 쓰고 계시다면 대부분 설치되어 있을 가능성이 높습니다. 터미널(명령 프롬프트/PowerShell/터미널 앱)을 열어서 하나씩 확인해보세요.

1. **Node.js 20 이상** — Peekly 자체가 이 위에서 돌아갑니다.
   ```bash
   node -v
   ```
   `v20`으로 시작하는 버전이 나오면 OK. `command not found` 같은 에러가 나오면 [nodejs.org](https://nodejs.org)에서 LTS 버전을 설치하세요. (npm은 Node.js를 설치하면 같이 따라옵니다.)
2. **Git** — GitHub에서 코드를 내려받는 데 필요합니다.
   ```bash
   git --version
   ```
   버전이 나오면 OK. 안 되어 있으면 [git-scm.com](https://git-scm.com)에서 설치하세요.
3. **Python 3 + pip** — PPT 보고서를 만들 때 씁니다.
   ```bash
   python --version
   pip --version
   ```
   (macOS/Linux는 `python3`, `pip3`인 경우가 많습니다.) 둘 다 버전이 나와야 합니다. 안 되어 있으면 [python.org](https://python.org)에서 설치하세요.
4. **Claude Code** — 이미 이 글을 읽고 계신다면 준비되어 있는 것입니다 (`claude` 명령으로 실행하는 그 프로그램).

넷 다 확인됐으면 아래로 넘어가세요.

## 설치 — 딱 한 번, 복사해서 붙여넣기만 하면 끝

터미널(아무 폴더에서나 — 프로젝트 폴더일 필요 없습니다)에 아래 블록을 **통째로 복사해서 한 번에 붙여넣으세요.** 컴퓨터 한 대당 딱 한 번만 하면 되고, 그 뒤로는 **어떤 프로젝트에서든** `/oh-my-peekly`를 바로 쓸 수 있습니다.

**macOS / Linux / Git Bash:**
```bash
git clone https://github.com/minsu0707/oh-my-peekly.git && \
cd oh-my-peekly && \
npm install && \
npm install -g . && \
pip install -r requirements.txt && \
claude plugin marketplace add ./ && \
claude plugin install oh-my-peekly@oh-my-peekly
```

**Windows (명령 프롬프트 `cmd.exe`):**
```bat
git clone https://github.com/minsu0707/oh-my-peekly.git && cd oh-my-peekly && npm install && npm install -g . && pip install -r requirements.txt && claude plugin marketplace add ./ && claude plugin install oh-my-peekly@oh-my-peekly
```
Windows에서는 **PowerShell이 아니라 명령 프롬프트(cmd)**를 쓰세요. PowerShell 5.1(윈도우 기본 버전)은 명령을 `&&`로 잇는 걸 지원하지 않아서, 위 한 줄짜리 명령이 중간에 실패해도 멈추지 않고 계속 진행해버릴 수 있습니다. cmd는 `&&`를 지원해서 한 줄 그대로 붙여넣으면 실패 시 그 자리에서 멈춥니다. (시작 메뉴에서 "cmd" 또는 "명령 프롬프트" 검색해서 열면 됩니다.)

끝까지 에러 없이 실행되면 설치 완료입니다. 마지막 줄에 플러그인 설치 성공 메시지가 보이면 성공입니다.

- **Claude Code 플러그인 자체가 이 컴퓨터에 처음 설치되는 거라면**, Claude Code를 한 번 껐다 켜거나 새 세션을 시작해야 명령이 인식됩니다. 그다음부터는 재시작 없이 계속 사용 가능합니다.
- 기본적으로 **사용자 스코프**로 설치되기 때문에, 이후 QA를 돌리고 싶은 프로젝트가 몇 개든 각 프로젝트마다 다시 설치할 필요 없이 바로 쓸 수 있습니다. 특정 프로젝트에만 설치하고 싶다면 마지막 줄을 `claude plugin install oh-my-peekly@oh-my-peekly --scope project`로 바꾸고 그 프로젝트 폴더에서 실행하세요.
- 플러그인으로 설치하면 명령이 `/oh-my-peekly:oh-my-peekly`처럼 `플러그인이름:스킬이름` 형태로 보일 수 있습니다 (플러그인 이름과 스킬 이름이 둘 다 `oh-my-peekly`라 그렇습니다). `peekly install-skill`로 개인/프로젝트 스코프에 직접 설치하면 `/oh-my-peekly` 하나로 뜹니다.

<details>
<summary>각 줄이 정확히 뭘 하는지 궁금하다면 (선택 사항, 안 읽어도 됩니다)</summary>

1. `git clone ...` — GitHub의 코드를 내 컴퓨터로 복사해옵니다.
2. `cd oh-my-peekly` — 방금 받은 폴더 안으로 들어갑니다.
3. `npm install` — Peekly가 내부적으로 쓰는 라이브러리(브라우저 자동화, PPT 생성 등)를 받습니다. `npm warn` 노란 경고가 몇 줄 떠도 정상입니다.
4. `npm install -g .` — 이 폴더를 컴퓨터 전체에서 `peekly-mcp` 명령으로 부를 수 있게 등록합니다. (3번을 먼저 해야 제대로 동작합니다. Playwright 브라우저 다운로드, keytar 네이티브 빌드 등도 이 단계에서 끝납니다 — 플러그인 설치 자체는 이런 의존성 설치를 대신 해주지 않기 때문에, 이 단계는 앞으로도 계속 필요합니다.)
5. `pip install -r requirements.txt` — PPT 생성에 쓰는 Python 라이브러리(`python-pptx`)를 설치합니다.
6. `claude plugin marketplace add ./` — 방금 clone한 이 폴더 자체를 (`.claude-plugin/marketplace.json` 덕분에) 플러그인 마켓플레이스로 등록합니다.
7. `claude plugin install oh-my-peekly@oh-my-peekly` — 그 마켓플레이스에서 `oh-my-peekly` 플러그인을 설치합니다. 이 한 번으로 `oh-my-peekly` 스킬과 Peekly MCP 서버(`.mcp.json`에 정의됨, 내부적으로 `npx peekly-mcp` 실행)가 함께 등록됩니다. `claude plugin list`에서 확인 가능합니다.

사전 준비물(Node.js 20+, Git, Python 3+pip, Claude Code)이 이미 안 되어 있다면 위 명령 중간에 에러가 납니다 — 아래 "사전 준비물" 섹션에서 확인하는 법을 참고하세요.

</details>

설치가 끝났으면 아래 "사용법"으로 넘어가시면 됩니다.

> **예전 방식(`claude mcp add` + `peekly install-skill`)으로 이미 설치했던 적이 있다면**: 플러그인으로 새로 설치하기 전에 `claude mcp remove peekly -s user`로 예전 등록을 지워주세요. 안 지우면 이름이 같은 `peekly` MCP 서버가 두 곳(수동 등록 + 플러그인 번들)에 남아 충돌할 수 있습니다. 스킬 이름도 `peekly`에서 `oh-my-peekly`로 바뀌었으니, `~/.claude/skills/peekly`가 남아있다면 `rm -rf ~/.claude/skills/peekly`로 지워주세요.

## 사용법

Claude Code에서:

```
/oh-my-peekly run
```

최초 실행 시 다음을 물어봅니다 (모두 선택지 중 하나를 고르는 방식 — 터미널처럼 Enter로 기본값을 받는 게 아니라 매번 옵션을 선택합니다):

- 서비스 URL
- 로그인 ID / PW *(OS 자격증명 저장소에 암호화 캐싱되어 다음부터 재입력 불필요)*
- 테스트결과서 PPT 템플릿 **파일명** *(전체 경로 아님 — Downloads/Desktop/Documents에서 자동 탐색)*
- (선택) 참고 첨부 파일 + 그 파일의 용도
- **이슈 검수 방식** *(한 번만 물어보고 계속 재사용 — "발견 즉시 자동 포함"이 기본값이고, "이슈마다 확인받기"를 고르면 아래 4번에서 매 이슈마다 물어봅니다)*
- **병렬 테스트 세션 수** *(대상 서비스 부하에 따라 다를 수 있어서 실행할 때마다 매번 다시 물어봅니다 — 몇 개의 브라우저 탭으로 화면을 나눠 동시에 테스트할지 결정)*

이후 흐름:

1. **사전 확인** — 사이트맵을 먼저 크롤링해서 화면 수를 세고, 예상 소요 시간·비용을 안내합니다. **사용자가 승인해야만** 실제 테스트가 시작됩니다.
2. **2단계 인증(2FA)** — 로그인 중 2FA가 감지되면 자동 진행을 멈추고 직접 인증을 요청합니다. 완료하면 자동 재개됩니다.
3. **화면별 테스트** — 병렬 세션 수만큼 브라우저 탭을 나눠 체크리스트 기준으로 화면을 동시에 순회하며 클릭/입력/스크린샷을 수행합니다. "정상" 판정 화면은 보고서 대상에서 항상 제외됩니다.
4. **이슈 검수** — 이슈 검수 방식이 "자동 포함"이면 발견한 이슈를 전부 자동으로 보고서 대상에 넣고 진행 상황만 계속 알려줍니다. "이슈마다 확인받기"를 골랐다면, 이슈를 발견할 때마다 스크린샷을 자동으로 열고 포함/제외를 선택지로 물어봅니다.
5. **보고서 생성** — 확정된 이슈만, 계정별로 분리된 `.pptx` 파일로 생성됩니다. 파일명도 기본값 사용/직접 입력 중 선택지로 물어봅니다.

두 번째 실행부터는:

```
/oh-my-peekly run --url <서비스 URL>
```

한 줄이면 ID/PW/템플릿 재입력 없이 바로 사전 확인 단계부터 시작합니다.

## 제거

```bash
npm uninstall -g peekly-mcp
claude plugin uninstall oh-my-peekly@oh-my-peekly
claude plugin marketplace remove oh-my-peekly
```

## 알려진 제약 (진행 중)

- **PPT 템플릿 규칙이 아직 임시값**: 실제 템플릿 파일이 없어서, 이슈 슬라이드는 템플릿의 2번째 슬라이드로 가정하고 `{{breadcrumb}}`/`{{problem}}`/`{{improvement}}` 텍스트 토큰 + `"screenshot"`이라는 이름의 도형을 치환하는 방식으로 구현되어 있습니다. 실제 템플릿을 주시면 이 규칙을 맞춰 수정합니다.
- **macOS 미검증**: 개발 환경이 Windows라 `mdfind`/`open` 분기는 코드 리뷰 수준으로만 확인했고 실제 실행 검증은 안 됐습니다.
- **npm 레지스트리 미배포**: `npm install -g peekly-mcp` (레지스트리 경유)가 아니라 위처럼 GitHub 클론 방식으로만 설치됩니다. `dist/`가 예외적으로 git에 커밋되어 있습니다 (자세한 이유는 `docs/CONVENTIONS.md` 참고).
- **플러그인 설치가 의존성 설치까지 대신해주지는 않습니다**: Claude Code의 플러그인 설치(`claude plugin install`)는 스킬/MCP 설정만 등록할 뿐, `npm install`(Playwright 브라우저 다운로드 포함)이나 keytar 네이티브 빌드, `pip install`을 대신 실행해주지 않습니다. 그래서 위 설치 명령에서 `npm install -g .` + `pip install -r requirements.txt` 단계는 플러그인으로 전환한 뒤에도 계속 남아 있습니다.
- **기본 체크리스트/크롤링 상한/비용 산출 공식**은 전부 잠정값이며, 실제 사내 QA 프로세스에 맞춰 조정이 필요합니다.
- Codex 지원(AGENTS.md)은 아직 없습니다.

개발 컨벤션은 [CONVENTIONS.md](./docs/CONVENTIONS.md), 변경 이력은 [CHANGELOG.md](./docs/CHANGELOG.md)를 참고하세요.
