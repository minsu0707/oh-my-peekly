---
description: 서비스 URL/계정/PPT 템플릿만 있으면 웹 서비스를 순회하며 QA 테스트를 수행하고, 발견한 이슈를 (설정에 따라 자동 포함 또는 이슈별 검수 후) 계정별 PPT 보고서로 생성한다.
when_to_use: 사용자가 "/peekly run", "QA 테스트", "서비스 점검", "테스트 결과서 만들어줘" 등을 요청할 때
disable-model-invocation: false
---

# Peekly — 웹 서비스 QA 자동 점검 워크플로우

이 문서는 **지시문**이다. 아래에서 호출하는 MCP 도구(`browser_*`, `sitemap_crawl`, `estimate_cost`, `generate_report`, `save_credentials`/`get_credentials`/`find_local_file`/`open_in_viewer`)는 전부 "판단하지 않는다" — 화면이 정상인지, 어떤 화면/체크리스트를 적용할지, 이슈를 보고서에 넣을지 같은 판단은 전부 너(에이전트)의 몫이다. 도구는 원재료(스크린샷, DOM, 클릭 결과, 크롤링 목록 등)만 반환한다.

아래 순서를 임의로 건너뛰거나 순서를 바꾸지 마라. 각 단계는 이전 단계의 사용자 응답에 의존한다.

**중요 — "Enter로 기본값 수락"은 채팅에서 그대로 동작하지 않는다**: 원 설계 문서는 터미널 CLI를 가정하고 "Y/n, Enter만 눌러도 기본값"이라고 적었지만, Claude Code는 채팅 인터페이스라 빈 입력을 그냥 전송하는 것 자체가 안 되거나 감지할 수 없다. 아래 단계에서 Y/N류의 빠른 확인이 필요할 때는 **`AskUserQuestion` 도구**를 써서 선택지를 제시하고, 기본으로 삼을 옵션의 라벨 끝에 `(권장)`을 붙여 한 번의 클릭/선택으로 기본값을 받아들일 수 있게 하라. 자유 텍스트(파일명 등)가 필요한 경우에도 "아무 응답이나 하면 기본값"이 아니라, 사용자의 답에 구체적인 값이 없으면(예: "네", "그대로", "ㅇㅋ" 등 확정 의사만 밝히는 답) 기본값을 쓰는 것으로 해석하라.

## 1단계 — 입력 수집 및 캐시 재사용

1. 사용자가 서비스 URL을 알려주면(또는 `--url` 인자로 받으면) 먼저 `get_credentials(serviceUrl)`을 호출해 캐시된 로그인 ID/PW가 있는지 확인한다.
   - `found: true`이면 재입력을 요구하지 말고 그대로 재사용한다.
   - `found: false`이면 사용자에게 로그인 ID/PW를 물어보고, 받은 즉시 `save_credentials(serviceUrl, loginId, password)`로 저장한다.
2. 테스트결과서 PPT 템플릿은 **파일명만** 물어본다(전체 경로 아님). `find_local_file(filename)`을 호출해 로컬에서 찾는다.
   - `found: true`이고 `matchCount`가 1이면 그 경로를 그대로 사용.
   - 여러 개 찾았거나(`matchCount > 1`) 못 찾았으면(`found: false`) 사용자에게 확인/재입력을 요청한다.
3. (선택) 참고할 첨부 파일이 있는지 물어본다. 있다면:
   - 파일명을 받고,
   - **"이 파일은 어떤 용도인가요?"**를 반드시 되물어라. 용도를 미리 카테고리화하지 마라 — 사용자가 설명한 그대로("정상 화면 기준을 확인하는 용도" 등) 참고 방식을 네가 유연하게 판단해서 이후 테스트에 활용한다.
4. 체크리스트는 사용자가 직접 입력할 수도 있고, 기본 제공 체크리스트(4단계 참조)를 쓸 수도 있다. 어느 쪽을 쓸지 물어보거나, 사용자가 특별히 언급하지 않으면 기본 체크리스트를 쓴다고 안내한다.
5. **이슈 검수 방식**: `get_setting(key: "issueReviewMode")`로 캐시된 설정이 있는지 먼저 확인한다.
   - `found: true`이면 그 값(`"auto"` 또는 `"manual"`)을 그대로 쓰고 다시 묻지 않는다.
   - `found: false`이면 `AskUserQuestion`으로 한 번만 물어본다: 옵션 `["발견 즉시 자동 포함 (권장)", "이슈마다 확인받기"]`. 고른 값을 `"auto"`/`"manual"`로 매핑해 `save_setting(key: "issueReviewMode", value: ...)`로 저장한다. (설정은 언제든 사용자가 "이슈 검수 방식 바꿔줘"라고 하면 다시 물어보고 덮어써라.)
6. 이 1단계는 최초 1회만 전부 수행한다. 이미 URL에 대한 자격증명과 템플릿 경로가 캐시되어 있으면, 이후 실행은 **URL만으로** 바로 2단계(사전 확인)부터 시작할 수 있어야 한다. (이슈 검수 방식 설정은 URL과 무관하게 한 번만 물어보면 계속 재사용된다.)

## 2단계 — 사전 확인 (비용·시간 안내, 사용자 승인 필수)

1. `sitemap_crawl(startUrl)`을 호출해 화면 목록을 먼저 확보한다. 이 시점에는 아직 실제 테스트(클릭/입력 등)를 시작하지 않는다.
2. 반환된 `totalCount`(및 `truncated` 여부)를 가지고 `estimate_cost(screenCount, checklistItemCount?)`를 호출한다.
3. `AskUserQuestion` 도구로 다음을 물어본다 (자유 텍스트 Y/n 프롬프트가 아니라 선택형 질문으로):
   - 질문 본문에 "총 {totalCount}개 화면 발견 / 예상 소요 시간 약 {estimatedMinutes}분 / 예상 비용 약 {estimatedCostKrw}원"을 포함한다.
   - 옵션: `["진행 (권장)", "취소"]`.
   - `truncated: true`이면 크롤링이 상한(도구의 provisional 기본값, 현재 50페이지)에서 잘렸을 수 있다는 점도 질문 본문에 함께 알려라.
4. **"진행"을 선택해야만** 3단계로 진행한다. "취소"를 선택하면 아무 것도 실행하지 않고 즉시 종료한다.

## 3단계 — 2단계 인증(2FA) 처리

- 로그인 흐름 중 `browser_navigate`/`browser_screenshot` 등으로 확인한 화면에서 2FA/OTP로 보이는 요소(인증코드 입력창, "인증번호를 입력하세요" 문구 등)를 발견하면, 이건 전용 도구가 없으므로 **네가 직접 스크린샷/페이지 상태를 보고 판단**해라.
- 감지되면 자동 진행을 즉시 멈추고 사용자에게 "인증을 직접 완료해주세요"라고 알린다.
- 사용자가 완료했다고 확인하면 자동으로 테스트를 재개한다.

## 4단계 — 화면별 테스트 루프

1. 2단계에서 확보한 화면 목록을 순회한다. 각 화면마다:
   - `browser_navigate(url)`로 이동
   - 체크리스트 항목에 따라 `browser_click`/`browser_type`으로 조작하고 `browser_screenshot`으로 증거를 남긴다 (이때 반환되는 `width`/`height`를 기억해둔다 — 아래 3번에서 필요)
   - 화면이 정상인지/이슈인지는 **네가 직접 판단**한다 (도구는 판단하지 않는다)
2. **기본 체크리스트(provisional, 미확정)**: 설계 문서 6장에서 기본 체크리스트 항목은 아직 확정되지 않은 오픈 이슈다. 사용자가 별도 체크리스트를 지정하지 않았다면 아래를 잠정 기본값으로 사용하되, 반드시 "확정된 사양이 아니며 원하면 다른 체크리스트로 대체 가능"이라고 사용자에게 밝혀라:
   - 클릭 반응 확인 (버튼/링크가 의도한 대로 반응하는지)
   - 폼 제출/파일 첨부 정상 동작 여부
   - 에러 메시지의 적절성
   - 레이아웃 정렬 문제 여부
3. **이슈의 문제 위치 표시(problemArea)**: 이슈가 특정 UI 요소(입력창, 버튼 등)에 딸린 문제라면, 그 요소의 CSS 셀렉터로 `browser_bounding_box(selector)`를 호출해 픽셀 단위 위치(x, y, width, height)와 뷰포트 크기를 받아온다. 이 값을 아래처럼 0~1 비율로 변환해서 나중에 6단계 `generate_report`의 `issues[].problemArea`에 그대로 넘긴다 (도구가 계산해주지 않으니 네가 직접 나눗셈해라):
   - `xFraction = x / viewportWidth`, `yFraction = y / viewportHeight`
   - `widthFraction = width / viewportWidth`, `heightFraction = height / viewportHeight`
   - (`viewportWidth`/`viewportHeight`는 `browser_bounding_box`가 반환하거나, 직전 `browser_screenshot`의 `width`/`height`와 같은 값이다 — 스크린샷과 같은 스크롤 위치에서 측정했다는 전제.) 특정 요소를 콕 집기 애매한 레이아웃/텍스트 이슈라면 `problemArea` 없이 넘어가도 된다(선택 사항).

## 5단계 — 이슈 정리 (1단계에서 캐시된 `issueReviewMode` 설정에 따라 분기)

- "정상"으로 판단한 화면은 설정과 무관하게 항상 보고서 대상에서 제외한다 (검수 목록에 아예 노출하지 않음).
- **`issueReviewMode == "auto"`** (기본/권장): 이슈로 판단한 항목을 전부 자동으로 보고서 대상에 포함한다. 화면별 테스트 진행 중 몇 번째 화면에서 어떤 문제를 발견했는지 사용자에게 계속 알려주되, 매번 응답을 기다리지는 않는다.
- **`issueReviewMode == "manual"`**: 이슈로 판단한 화면마다
  1. `open_in_viewer(screenshotPath)`로 해당 스크린샷을 자동으로 연다.
  2. `AskUserQuestion` 도구로 물어본다 — 질문 본문에 `[n/총계] {경로 브레드크럼} --> [{계정/권한}]`과 `문제: {발견한 문제 설명}`을 포함하고, 옵션은 `["포함 (권장)", "제외"]`.
  3. "제외"를 선택한 이슈만 이후 보고서 생성 대상에서 뺀다.

## 6단계 — 보고서 생성

1. 5단계 결과 최종 확정된 이슈 목록을 사용한다 (`auto` 모드면 전부, `manual` 모드면 "포함"으로 확정된 것만).
2. **계정 단위로 보고서를 분리**한다 — `generate_report`는 한 번 호출에 계정 1개 보고서 1개만 만든다. 계정이 여러 개면 계정 수만큼 반복 호출해야 한다(도구가 다중 계정을 알아서 나눠주지 않는다).
3. 각 계정마다 `generate_report(templatePath, outputPath?, accountName?, issues[])`를 호출한다. 이때 `issues`는 각 항목이 `breadcrumb`/`screenshotPath`/`problem`/`improvement` 4개 필드를 가진 배열이어야 하고, 4단계 3번에서 계산해둔 `problemArea`가 있으면 그 항목도 함께 넘긴다(선택 필드).
4. 파일명은 2단계로 물어본다 (자유 텍스트 "Enter 시 기본값" 방식이 아니라):
   1. 먼저 `AskUserQuestion`으로 Y/N을 물어본다: 질문 본문에 계산해둔 기본 파일명(`템플릿이름_계정명_날짜`, 계정이 여러 개면 뒤에 계정명이 자동으로 붙는다는 것까지 포함)을 보여주고, 옵션은 `["기본값 사용 (권장)", "직접 입력"]`.
   2. **"기본값 사용"을 선택하면** 그 기본값을 그대로 쓴다.
   3. **"직접 입력"을 선택한 경우에만** 그다음에 실제로 쓸 파일명을 자유 텍스트로 물어본다.
   - 계정이 1개면 (기본값이든 직접 입력이든) 그 이름 그대로 사용, 계정이 여러 개면 이름 뒤에 계정명을 자동으로 붙여 계정별로 구분한다. **이 다중 계정 파일명 분기 로직은 `generate_report` 도구가 하지 않으므로, 반드시 네가 계정별 `outputPath`를 직접 계산해서 넘겨야 한다.**

## 7단계 — 완료 안내

- 생성된 모든 계정별 결과물의 경로를 사용자에게 안내한다. 예:
  ```
  완료! 결과물: ./output/EEM_QC결과서_0803_qc_user.pptx
  ```
- 다음부터는 `/peekly run --url <url>` 한 줄이면 ID/PW/템플릿 재입력 없이 2단계(사전 확인)부터 바로 시작할 수 있다고 안내한다.

---

## 참고: 사용하는 MCP 도구 요약

| 도구 | 입력 | 출력(핵심) | 비고 |
|---|---|---|---|
| `get_credentials` | serviceUrl | found, loginId, password | 없으면 found:false (에러 아님) |
| `save_credentials` | serviceUrl, loginId, password | success | |
| `get_setting` | key | found, value | 없으면 found:false (에러 아님). 예: `issueReviewMode` |
| `save_setting` | key, value | success | 비밀정보 아닌 설정용 (keytar 아님, 평문 JSON 캐시) |
| `find_local_file` | filename | found, path, matchCount | 전체 경로가 아닌 파일명 기반 검색 |
| `sitemap_crawl` | startUrl, maxPages? | urls, totalCount, truncated | maxPages 기본값(현재 50)은 provisional |
| `estimate_cost` | screenCount, checklistItemCount? | estimatedMinutes, estimatedCostKrw, assumptions | 산출 공식·기본 체크리스트 개수는 provisional |
| `browser_navigate` | url | success, url, title, status | |
| `browser_click` | selector, timeoutMs? | success, url | |
| `browser_type` | selector, text, timeoutMs? | success | |
| `browser_screenshot` | path? | success, path, width, height | width/height는 problemArea 비율 계산에 사용 |
| `browser_bounding_box` | selector | success, x, y, width, height, viewportWidth, viewportHeight | 문제 요소의 픽셀 위치 — 판단 없이 사실만 반환 |
| `open_in_viewer` | filePath | success | |
| `generate_report` | templatePath, outputPath?, accountName?, issues[] (각 항목에 선택적 problemArea) | outputPath, slideCount | 호출 1회 = 계정 1개 보고서 1개. problemArea 있으면 스크린샷 위에 배경색 없는 테두리 도형으로 표시 |

이 요약은 참고용이며, 실제 zod 스키마는 `src/tools/*.ts`를 기준으로 한다.
