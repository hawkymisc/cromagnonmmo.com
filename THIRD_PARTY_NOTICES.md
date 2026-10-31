# 外部の素材とライセンス

このリポジトリと公開サイトで使っている、外部のライブラリ・モデル・データ・音源です。条件はそれぞれの配布元のライセンスに従います。

## ブラウザーへ配信するライブラリ

| 名前                                                                                  | 版                     | ライセンス | このリポジトリでの扱い                                                                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [three.js](https://threejs.org/)                                                      | 0.185.1                | MIT        | pnpmで導入し、`scripts/prepare-vendor.mjs` が `public/vendor/` へコピーする。ライセンス本文も `public/vendor/three-LICENSE.txt` として一緒に配信する |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) のデコーダー（three.js同梱版） | 1.1（three.js 0.185.1に同梱） | MIT | `public/vendor/addons/libs/meshopt_decoder.module.js` と、全文の `public/vendor/meshoptimizer-LICENSE.txt` を配信する |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | 1.0.1 | Apache-2.0 | ローカル用の `public/vendor/mediapipe/` へコピーし、`LICENSE.txt` も同梱する |

`public/vendor/` はGitに含めず、`pnpm start`・`pnpm run dev`・`pnpm test` の前に作られます。

公開用の静的ビルドにも、リポジトリの `LICENSE`・`NOTICE`・この一覧を `LICENSE.txt`・`NOTICE.txt`・`THIRD_PARTY_NOTICES.txt` として同梱します。

## モデル

| 名前                                                | ライセンス | 場所                                                                                                    |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| MediaPipe Hand Landmarker（float16 v1、Google配布） | Apache-2.0 | `public/motion/hand_landmarker-float16-v1.task`。ライセンス本文は `public/motion/MEDIAPIPE-LICENSE.txt` |

公式ガイドからリンクされた [Hand Trackingモデルカード（2ページ目）](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf) でも、学習済みモデルがApache License 2.0であることを確認しています。

## データ

- **[ETOPO1 Global Relief Model](https://www.ncei.noaa.gov/products/etopo-global-relief-model)**（NOAA NCEI）：世界の海岸線と地形のもと。NOAA AOML ERDDAPの `etopo180` から6分間隔で取得した。
- **Spratt, R. M. & Lisiecki, L. E. (2016), A Late Pleistocene sea level stack**, Climate of the Past 12, 1079–1092, [doi:10.5194/cp-12-1079-2016](https://cp.copernicus.org/articles/12/1079/2016/)：当時の海面（−68.3 m）の根拠。
- **[CMU Graphics Lab Motion Capture Database](https://mocap.cs.cmu.edu/)**：人物の歩行（被験者35の35_01）と走行（被験者09の09_01）の動き。

  [公式FAQ](https://mocap.cs.cmu.edu/faqs.php) は、動作データの複製・改変・再配布を許可しています。[公式トップページ](https://mocap.cs.cmu.edu/) は商用製品への組み込みも認めていますが、変換後も含めて動作データ自体の再販売を禁止しています。CMU由来の歩行・走行クリップにはこの独自条件が適用され、プロジェクトのApache-2.0で再許諾するものではありません。再配布時も出典と条件を確認できるよう、この項目を保持してください。元のASF・AMCファイルはリポジトリに含めていません。

  > The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

## 音

自然の音と効果音（`public/audio/nature/`、2026-10-11の第4版）は、[Freesound](https://freesound.org/)でCC0（CC0-1.0）として公開されている次の録音と、[VSCO 2 Community Edition](https://versilian-studios.com/vsco-community/)（Versilian Studios、CC0）の楽器サンプル（[sgossner/VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE) のコミット `440300901dfe9275fd84e0b7763af1f8443ae62e`）から作っています。CC0なので表示の義務はありませんが、感謝を込めて挙げます。

| 録音                                                                                                                    | 作者              | 使ったところ           |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------- |
| [Wind through the grass](https://freesound.org/people/strangy/sounds/176249/)                                           | strangy           | 風                     |
| [Murmuring Stream](https://freesound.org/people/borralbi/sounds/337614/)                                                | borralbi          | 川                     |
| [Ambiance_Stream_Moderate_Skaftafell_Loop_Stereo_01](https://freesound.org/people/Nox_Sound/sounds/690215/)             | Nox_Sound         | 小川                   |
| [Ambiance_Waterfall_Small_Close_Loop_Stereo](https://freesound.org/people/Nox_Sound/sounds/698306/)                     | Nox_Sound         | 滝                     |
| [Ambiance_Ocean_Praia_dos_Moinhos_Loop_Stereo_02](https://freesound.org/people/Nox_Sound/sounds/829627/)                | Nox_Sound         | 浜                     |
| [Light rain in a field of bananas trees](https://freesound.org/people/felix.blume/sounds/512334/)                       | felix.blume       | 雨                     |
| [fire small campfire crackling short +air tone](https://freesound.org/people/kyles/sounds/637523/)                      | kyles             | 焚き火                 |
| [campfire.wav](https://freesound.org/people/Spandau/sounds/40699/)                                                      | Spandau           | 松明                   |
| [Birds singing in the countryside, Oklahoma, USA](https://freesound.org/people/felix.blume/sounds/202900/)              | felix.blume       | 鳥                     |
| [Blackbird 252.wav](https://freesound.org/people/nigelcoop/sounds/116791/)                                              | nigelcoop         | 鳥                     |
| [Dripping water](https://freesound.org/people/Electroviolence/sounds/234554/)                                           | Electroviolence   | しずく                 |
| [IR_Cathedral_5m_Stereo](https://freesound.org/people/Nox_Sound/sounds/648945/)                                         | Nox_Sound         | 洞窟と洞窟の音楽の残響 |
| [IR_Church_Small_5m_Stereo](https://freesound.org/people/Nox_Sound/sounds/585739/)                                      | Nox_Sound         | 音楽の残響             |
| [Footsteps_Mountain_Boots_Grass_Mono](https://freesound.org/people/Nox_Sound/sounds/556042/)                            | Nox_Sound         | 草の足音・ジャンプ     |
| [Footsteps_Mountain_Boots_Wet_Sand_Sequence_Mono](https://freesound.org/people/Nox_Sound/sounds/564893/)                | Nox_Sound         | 砂の足音               |
| [Footsteps_Mountain_Boots_Rock_Walk_Sequence_Mono](https://freesound.org/people/Nox_Sound/sounds/558472/)               | Nox_Sound         | 岩の足音               |
| [Footsteps_Mountain_Boots_Snow_Walk_Mono](https://freesound.org/people/Nox_Sound/sounds/613849/)                        | Nox_Sound         | 雪の足音               |
| [Splashing Footsteps Shallow Water](https://freesound.org/people/ChristopherJngs/sounds/861369/)                        | ChristopherJngs   | 水の足音               |
| [Short Whoosh, 13x](https://freesound.org/people/Kinoton/sounds/427979/)                                                | Kinoton           | 攻撃・投げる           |
| [Power Kick, Body Impact, 7x](https://freesound.org/people/Kinoton/sounds/586841/)                                      | Kinoton           | ダメージ               |
| [Cloth - heavy - shake - run - trouser](https://freesound.org/people/ValentinPetiteau/sounds/624478/)                   | ValentinPetiteau  | ジャンプ               |
| [Cloth Rustle 1](https://freesound.org/people/zazz.sound.design/sounds/435291/)                                         | zazz.sound.design | 乗る                   |
| [fabric rubbing / pulling](https://freesound.org/people/dynamique/sounds/554561/)                                       | dynamique         | 撫でる                 |
| [rock_collisions.wav](https://freesound.org/people/Plaban2001/sounds/579409/)                                           | Plaban2001        | 石の採集               |
| [Foley_Object_Basket_WithWood_Stick_PickUp_Into_Sequence_Stereo](https://freesound.org/people/Nox_Sound/sounds/846927/) | Nox_Sound         | 木の採集               |
| [Foley_Movement_High_Grass_Mono](https://freesound.org/people/Nox_Sound/sounds/559082/)                                 | Nox_Sound         | 植物の採集             |
| [Foley_Object_Match_Ignition_Sequence_Stereo](https://freesound.org/people/Nox_Sound/sounds/846930/)                    | Nox_Sound         | 松明の切り替え         |
| [catHisses1](https://freesound.org/people/Zabuhailo/sounds/146963/)                                                     | Zabuhailo         | りもねこの威嚇         |

配信する音は `public/audio/` にあります。録音の原本、ETOPO1の元データ、CMUのASF・AMCファイルは同梱していません。

## サーバーと開発用

- Nodeサーバーは [ws](https://github.com/websockets/ws)（MIT）を使います。
- 開発用の道具（TypeScript、esbuild、Prettier、Playwright、sharp、Wranglerなど）はpnpmで導入し、このリポジトリには含めません。

## 制作に使った道具（リポジトリには含めない）

- TRELLIS-2（参照画像からの3D復元）、Blender
