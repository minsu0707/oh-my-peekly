# Peekly

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

## 설치

터미널에서 **한 줄씩 순서대로** 복사해서 실행하세요. 이미 어딘가에 이 프로젝트를 받아둔 폴더가 있다면(이 저장소를 보고 계신 것 자체가 그 폴더일 수 있습니다), `git clone`은 건너뛰고 터미널에서 그 폴더로 `cd`만 한 뒤 2단계부터 이어서 하면 됩니다.

**1단계 — 저장소 받기 + 폴더 이동**
```bash
git clone https://github.com/minsu0707/oh-my-peekly.git
cd oh-my-peekly
```
`git clone`은 GitHub에 있는 코드를 내 컴퓨터로 복사해오는 명령입니다. `cd oh-my-peekly`는 방금 받은 폴더 안으로 들어가는 명령이고요. **이 뒤의 모든 명령은 이 폴더 안에서 실행되어야 합니다.**

**2단계 — 프로그램이 필요로 하는 부품(의존성) 설치**
```bash
npm install
```
Peekly가 내부적으로 쓰는 라이브러리들(브라우저 자동화, PPT 생성 등)을 받는 단계입니다. 1~2분 정도 걸릴 수 있고, 중간에 `npm warn` 같은 노란 경고 몇 줄이 떠도 정상입니다(에러가 아니라 경고입니다). 마지막에 `found 0 vulnerabilities` 비슷한 문구가 보이면 성공입니다.

**3단계 — 컴퓨터 어디서나 쓸 수 있게 전역 설치**
```bash
npm install -g .
```
방금 받은 이 폴더를 컴퓨터 전체에서 `peekly-mcp`, `peekly` 명령으로 부를 수 있게 등록하는 단계입니다. **2단계를 먼저 하지 않고 이 명령만 실행하면 제대로 동작하지 않으니, 반드시 순서대로** 하세요.

**4단계 — PPT 생성에 필요한 Python 라이브러리 설치**
```bash
pip install -r requirements.txt
```

여기까지 하면 컴퓨터에 설치가 끝난 것입니다. 잘 됐는지 확인하려면:
```bash
peekly-mcp --help
```
처럼 명령이 "command not found" 없이 반응하면 (에러 메시지가 나오더라도 "찾을 수 없다"는 에러만 아니면) 설치가 된 것입니다.

**5단계 — Claude Code에 Peekly를 실제로 연결하기**

이제부터는 Peekly를 사용하고 싶은 프로젝트 폴더로 이동해서(위 1~4단계와는 다른, 여러분이 QA를 돌리고 싶은 그 프로젝트) 아래 두 줄을 실행하세요.

```bash
claude mcp add peekly -- npx peekly-mcp
peekly install-skill
```

- 첫 번째 줄: Claude Code에게 "Peekly라는 도구를 쓸 수 있다"고 알려주는 등록 과정입니다. `claude mcp list`를 실행했을 때 `peekly ... ✔ Connected`라고 나오면 성공입니다.
- 두 번째 줄: `/peekly` 명령 자체를 이 프로젝트에 설치합니다.
- **주의**: 이 프로젝트에 `.claude/skills/` 폴더가 원래 없었다면, Claude Code를 한 번 껐다 켜야(또는 새 세션을 시작해야) `/peekly` 명령이 인식됩니다. 이미 있던 폴더라면 바로 됩니다.

이제 설치가 전부 끝났습니다 — 아래 "사용법"으로 넘어가시면 됩니다.

## 사용법

Claude Code에서:

```
/peekly run
```

최초 실행 시 다음을 물어봅니다 (한 번만):

- 서비스 URL
- 로그인 ID / PW *(OS 자격증명 저장소에 암호화 캐싱되어 다음부터 재입력 불필요)*
- 테스트결과서 PPT 템플릿 **파일명** *(전체 경로 아님 — Downloads/Desktop/Documents에서 자동 탐색)*
- (선택) 참고 첨부 파일 + 그 파일의 용도

이후 흐름:

1. **사전 확인** — 사이트맵을 먼저 크롤링해서 화면 수를 세고, 예상 소요 시간·비용을 안내합니다. **사용자가 승인해야만** 실제 테스트가 시작됩니다.
2. **2단계 인증(2FA)** — 로그인 중 2FA가 감지되면 자동 진행을 멈추고 직접 인증을 요청합니다. 완료하면 자동 재개됩니다.
3. **화면별 테스트** — 체크리스트 기준으로 화면을 순회하며 클릭/입력/스크린샷을 수행합니다.
4. **이슈 검수(Y/N)** — 이슈 발견 시 스크린샷을 자동으로 열고 보고서 포함 여부를 물어봅니다 (Enter = 기본값 Y=포함). "정상" 판정 화면은 이 단계에 아예 나타나지 않습니다.
5. **보고서 생성** — Y로 확정된 이슈만, 계정별로 분리된 `.pptx` 파일로 생성됩니다.

두 번째 실행부터는:

```
/peekly run --url <서비스 URL>
```

한 줄이면 ID/PW/템플릿 재입력 없이 바로 사전 확인 단계부터 시작합니다.

## 제거

```bash
npm uninstall -g peekly-mcp
claude mcp remove peekly
```

## 알려진 제약 (진행 중)

- **PPT 템플릿 규칙이 아직 임시값**: 실제 템플릿 파일이 없어서, 이슈 슬라이드는 템플릿의 2번째 슬라이드로 가정하고 `{{breadcrumb}}`/`{{problem}}`/`{{improvement}}` 텍스트 토큰 + `"screenshot"`이라는 이름의 도형을 치환하는 방식으로 구현되어 있습니다. 실제 템플릿을 주시면 이 규칙을 맞춰 수정합니다.
- **macOS 미검증**: 개발 환경이 Windows라 `mdfind`/`open` 분기는 코드 리뷰 수준으로만 확인했고 실제 실행 검증은 안 됐습니다.
- **npm 레지스트리 미배포**: `npm install -g peekly-mcp` (레지스트리 경유)가 아니라 위처럼 GitHub 클론 방식으로만 설치됩니다. `dist/`가 예외적으로 git에 커밋되어 있습니다 (자세한 이유는 `CONVENTIONS.md` 참고).
- **기본 체크리스트/크롤링 상한/비용 산출 공식**은 전부 잠정값이며, 실제 사내 QA 프로세스에 맞춰 조정이 필요합니다.
- Codex 지원(AGENTS.md)은 아직 없습니다.

개발 컨벤션은 [CONVENTIONS.md](./CONVENTIONS.md), 변경 이력은 [CHANGELOG.md](./CHANGELOG.md)를 참고하세요.
