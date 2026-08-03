# Peekly

서비스 URL, 로그인 계정, 테스트결과서(PPT) 양식만 주면 Claude Code가 직접 웹 서비스를 돌아다니며 QA 테스트를 수행하고, 발견한 이슈를 사용자 검수(Y/N) 후 계정별 PPT 보고서로 만들어주는 MCP 서버 + 스킬입니다.

> 현재 **Claude Code 전용**으로 설치·검증되어 있습니다. Codex 지원은 이후 단계입니다 (아래 "알려진 제약" 참고).
> 사내 전용 도구라 npm 레지스트리에 올리지 않고, 이 GitHub 저장소에서 직접 설치합니다.

## 사전 준비물

- Node.js 20 이상 + npm
- Git
- Python 3 + pip (PPT 보고서 생성용 `python-pptx`)
- Claude Code CLI (`claude` 명령)

## 설치

아래를 그대로 복사해서 순서대로 실행하세요.

```bash
git clone https://github.com/minsu0707/oh-my-peekly.git
cd oh-my-peekly
npm install
npm install -g .
pip install -r requirements.txt
```

그리고 Peekly를 사용할 프로젝트(또는 아무 폴더)에서:

```bash
claude mcp add peekly -- npx peekly-mcp
peekly install-skill
```

- `claude mcp add`는 Claude Code에 Peekly MCP 서버를 등록합니다 (`claude mcp list`로 `peekly ... ✔ Connected` 확인 가능).
- `peekly install-skill`은 `/peekly` 명령을 그 프로젝트의 `.claude/skills/peekly/`에 설치합니다.
- **`.claude/skills/` 폴더가 그 프로젝트에 원래 없었다면**, Claude Code를 재시작(또는 새 세션 시작)해야 `/peekly`가 인식됩니다. 이미 있었다면 재시작 없이 바로 됩니다.

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
