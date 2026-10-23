# Lesson 7. Is This Your Jacket? — 말하기 연습 웹 앱

초등 4학년 정보 차(Information Gap) 활동지 「물건의 주인이 누구인지 친구에게 물어보기」를
혼자서도 연습할 수 있게 만든 웹 앱입니다. 활동지의 6개 물건과 색깔을 그대로 사용합니다.

| 물건 | coat | dress | jacket | T-shirt | bag | belt |
|---|---|---|---|---|---|---|
| 내 물건 색깔 (활동지 색 막대) | red | yellow | blue | green | black | orange |

## 기능
1. **표현 익히기** – 물건을 누르면 세 문장을 원어민 음성(TTS)으로 들려줍니다.
   - 질문: *Is this your coat?*
   - 내가 주인이면: *Yes, it's mine.*
   - 내가 주인이 아니면: *No, it's not. My coat is red.*
2. **말하기 연습** – 물건 × 상황(질문 / Yes / No) 18문장을 녹음하고,
   음성 인식으로 **정확도 점수(0~100)** 와 단어별 결과(초록·노랑·빨강)를 보여 줍니다.
   내 녹음 다시 듣기, 원어민과 비교하기, 문장 숨기기(도전 모드), 물건별 최고 점수 표시(★).
3. **친구 찾기 게임** – 활동지처럼 6개 중 2개를 내 물건(Me)으로 정하고, 가상 친구를 만나
   - 내가 *Is this your ___?* 라고 말하면(60점 이상) 친구가 Yes/No로 대답하고, 주인이면 활동지에 이름이 적힙니다.
   - 친구가 나에게 물어보면 Me 여부에 맞게 *Yes, it's mine.* / *No, it's not. My ___ is ___.* 로 대답해야 합니다.

## 사용 방법
- 별도 설치 없이 정적 파일(`index.html`, `style.css`, `app.js`, `images/`)만으로 동작합니다.
- 마이크는 **https** 주소(또는 `localhost`)에서만 쓸 수 있습니다. GitHub Pages로 배포하면 바로 사용할 수 있어요.
  (저장소 Settings → Pages → Branch 선택 → 저장)
- 로컬에서 실행: `python3 -m http.server` 후 `http://localhost:8000` 접속.
- 음성 인식(정확도 측정)은 **Chrome / Edge / Safari** 에서 지원됩니다. 인식에 인터넷 연결이 필요합니다.
  지원하지 않는 브라우저에서는 녹음·듣기만 가능하고, 게임에서는 학생이 직접 Yes/No를 선택합니다.

## 채점 방식
음성 인식 결과(후보 최대 5개)와 목표 문장을 단어 단위로 맞춰 보고(it's = it is, T-shirt 표기 차이 등 정규화),
맞은 단어 비율로 점수를 매깁니다. 비슷하지만 다른 단어는 반 점, 불필요하게 많은 단어는 약간 감점됩니다.
90점↑ Excellent, 70점↑ Great, 50점↑ Good try.
