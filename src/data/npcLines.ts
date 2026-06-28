// NPCセリフ 量産用DB(スプレッドシート「セリフDB_量産用」由来。dlg_id を memo に残す)。
// 1要素=1バリアント。同一(idx, cat)に複数足してランダムに出す。バリアントがある(idx,cat)は
// こちらを優先採用(=キャラ設定リライト反映)。無ければ呼び出し側の既存1文(BASE_SOLDIERS)へフォールバック。
// idx=soldierIndex: edgar0 / joseph1 / elizabeth2 / musashi3 / oklahoma4 / chen5 / lauren6 / phaser7
// cat: sortie / surrounded / rescued / pushback / baseNear / baseCaptured / neglectFar / companion / praise / rescueReturned / npcKill
export const NPC_SCENE_VARIANTS: { idx: number; cat: string; text: string }[] = [
  // base_captured (拠点解放時)
  { idx: 0, cat: 'baseCaptured', text: 'よし、東部拠点は俺たちのもんだ！よく押し切った！' },        // dlg_000001
  { idx: 0, cat: 'baseCaptured', text: 'ここから東を押し返すぞ。お前ならついて来られる！' },        // dlg_000002
  { idx: 0, cat: 'baseCaptured', text: 'よし、ここは俺たちの前線だ！お前となら、もっと押せる！' },  // dlg_000050
  { idx: 1, cat: 'baseCaptured', text: '取った取った！いやー、こういう瞬間のために生きてるよな！' }, // dlg_000051
  { idx: 2, cat: 'baseCaptured', text: 'ここなら、傷ついた人を迎えられますわ。よくやりました。' },  // dlg_000052
  { idx: 3, cat: 'baseCaptured', text: '拠点、制した。見事な働きであった。' },                      // dlg_000053
  { idx: 4, cat: 'baseCaptured', text: '一致団結の勝利です！あなたの奮戦、忘れません！' },          // dlg_000054
  { idx: 5, cat: 'baseCaptured', text: '拠点確保。ふふ、完璧な布陣だ。君も実によく動いた。' },      // dlg_000055
  { idx: 6, cat: 'baseCaptured', text: 'やった！取れたよ！ほんとすごい、ここまで来ちゃった！' },    // dlg_000056
  { idx: 7, cat: 'baseCaptured', text: 'チッ……やるじゃねえか。ここまで来たなら、守り切るぞ。' },   // dlg_000057
  // sortie_start (出撃時)
  { idx: 0, cat: 'sortie', text: '東は俺が引っ張る！お前は目の前の敵をぶっ飛ばせ！' },              // dlg_000010
  { idx: 1, cat: 'sortie', text: '景気づけに一発、でかい突破を見せてくれよ！' },                    // dlg_000011
  { idx: 2, cat: 'sortie', text: 'まだ誰かが残っているなら、見落とすわけにはいきませんわ。' },      // dlg_000012
  { idx: 3, cat: 'sortie', text: '御意。声を潜めよ、曲者を呼ぶ。' },                                  // dlg_000013
  { idx: 4, cat: 'sortie', text: '一意専心で行きましょう。必ず道は開けます。' },                    // dlg_000014
  { idx: 5, cat: 'sortie', text: 'ふっ、布石は済んだ。あとは君が派手に決めるだけだ。' },            // dlg_000015
  { idx: 6, cat: 'sortie', text: 'よし、今日も戻れる場所を増やそう！絶対いけるよ！' },              // dlg_000016
  { idx: 7, cat: 'sortie', text: '足引っ張るなよ。……死なれたら後味悪いだろうが。' },               // dlg_000017
  { idx: 0, cat: 'sortie', text: 'よし、出るぞ！今日も前線を押し上げる！' },                         // dlg_000146
  { idx: 0, cat: 'sortie', text: '俺が道を開く。お前は迷わずついて来い！' },                         // dlg_000147
  { idx: 0, cat: 'sortie', text: '生きて戻るぞ。ついでに、敵の陣地も少し削る！' },                   // dlg_000148
  { idx: 1, cat: 'sortie', text: 'さあ開幕だ！今日の主役は誰かな、俺かな、お前かな？' },             // dlg_000149
  { idx: 1, cat: 'sortie', text: '景気よく行こうぜ！暗い顔してたら敵が調子に乗る！' },               // dlg_000150
  { idx: 1, cat: 'sortie', text: 'よーし、出番だ！派手すぎず、でも地味すぎずな！' },                 // dlg_000151
  { idx: 2, cat: 'sortie', text: '出撃しますわ。無茶は許しません、必ず戻ります。' },                 // dlg_000152
  { idx: 2, cat: 'sortie', text: '負傷者を増やすためではなく、救うために進みますわ。' },             // dlg_000153
  // surrounded (敵に囲まれた時)
  { idx: 0, cat: 'surrounded', text: '囲まれたか。焦るな、俺が前をこじ開ける！' },                  // dlg_000018
  { idx: 1, cat: 'surrounded', text: 'おいおい、歓迎されすぎだろ！出口作るぞ！' },                  // dlg_000019
  { idx: 2, cat: 'surrounded', text: 'ずいぶん無作法な囲み方ですわね。突破口を作ります。' },        // dlg_000020
  { idx: 3, cat: 'surrounded', text: '曲者か。退くな、間合いを見よ。' },                            // dlg_000021
  { idx: 4, cat: 'surrounded', text: '四面楚歌……ですが、突破口は必ずあります！' },                 // dlg_000022
  { idx: 5, cat: 'surrounded', text: 'ハマったな、敵の方がね。外周から崩すよ。' },                  // dlg_000023
  { idx: 6, cat: 'surrounded', text: 'うわ、多い！でも大丈夫、逃げ道だけは残そう！' },              // dlg_000024
  { idx: 7, cat: 'surrounded', text: '多いな……気をつけろ。俺から離れるんじゃねえぞ。' },           // dlg_000025
  // rescued_from_surrounded (助けてもらった時)
  { idx: 0, cat: 'rescued', text: 'よく来た！お前なら来ると思ってたぜ！' },                         // dlg_000026
  { idx: 1, cat: 'rescued', text: 'うっわ、今の助け方はズルいだろ！惚れるわ！' },                   // dlg_000027
  { idx: 1, cat: 'rescued', text: '助かった！いやー、今のは文句なしにカッコよかったぜ！' },          // dlg_000003
  { idx: 2, cat: 'rescued', text: 'あら、見事ですわ。少しだけ、見直しました。' },                   // dlg_000028
  { idx: 3, cat: 'rescued', text: '見事な助太刀。御恩、しかと受けた。' },                            // dlg_000029
  { idx: 4, cat: 'rescued', text: '勇猛果敢……まさにその一言です！' },                              // dlg_000030
  { idx: 5, cat: 'rescued', text: '敵の意表を突くとは！君には驚かされてばかりだ！' },               // dlg_000031
  { idx: 6, cat: 'rescued', text: 'ありがと！ほんと助かった、さすがだね！' },                       // dlg_000032
  { idx: 7, cat: 'rescued', text: 'チッ……助かったぜ。次は俺が助ける。' },                          // dlg_000033
  // fallback (後退する時)
  { idx: 0, cat: 'pushback', text: '悪い、少し下がる！だが前線は切らせねえ！' },                    // dlg_000034
  { idx: 1, cat: 'pushback', text: 'うわ、押されてる！一回下がるけど、まだ終わってねえぞ！' },      // dlg_000035
  { idx: 2, cat: 'pushback', text: '敵圧が強すぎますわ。態勢を立て直します。' },                    // dlg_000036
  { idx: 3, cat: 'pushback', text: '敵勢、強し。一度退き、構え直す。' },                            // dlg_000005/000037
  { idx: 4, cat: 'pushback', text: '一時後退です！臨機応変、必ず巻き返します！' },                  // dlg_000038
  { idx: 5, cat: 'pushback', text: '前線を下げる。予定外だが、まだ僕の盤面だ。' },                  // dlg_000039
  { idx: 6, cat: 'pushback', text: 'ごめん、ちょっと押されてる！でもすぐ戻すから！' },              // dlg_000040
  { idx: 7, cat: 'pushback', text: 'チッ……押されてる。だが、潰されるほど鈍くねえ。' },             // dlg_000041
  // base_near (拠点が見えてきた時)
  { idx: 0, cat: 'baseNear', text: '見えたぞ！ここまで押したのはお前の力だ！' },                    // dlg_000042
  { idx: 1, cat: 'baseNear', text: 'おっ、見えた見えた！あと少しで俺たちの場所だ！' },              // dlg_000043
  { idx: 2, cat: 'baseNear', text: 'あれが拠点ですわね。人を守れる場所に戻しましょう。' },          // dlg_000044
  { idx: 3, cat: 'baseNear', text: '拠点、目前。ここを取らば、道は開けよう。' },                    // dlg_000045
  { idx: 4, cat: 'baseNear', text: '目前到達です！ここまでの奮戦、見事でした！' },                  // dlg_000046
  { idx: 5, cat: 'baseNear', text: 'ここまで来れば詰めだ。ふふ、実に美しい展開だね。' },            // dlg_000047
  { idx: 5, cat: 'baseNear', text: '見えたな。ここまで読めていたよ、もちろん。' },                  // dlg_000007
  { idx: 6, cat: 'baseNear', text: '見えた！あとちょっと！ここまで来たなら絶対いけるよ！' },        // dlg_000048
  { idx: 7, cat: 'baseNear', text: '見えたな。チッ……油断すんな、最後が一番荒れる。' },             // dlg_000049
  // player_rampage (プレイヤー無双時)
  { idx: 0, cat: 'praise', text: 'いいぞ、そのまま押し切れ！お前が道を作ってる！' },                // dlg_000066
  { idx: 1, cat: 'praise', text: 'おいおい、主人公すぎるだろ！こっちの出番なくなるぞ！' },          // dlg_000067
  { idx: 2, cat: 'praise', text: 'あら……想像以上ですわね。その勢い、頼もしいです。' },              // dlg_000068
  { idx: 3, cat: 'praise', text: '見事。まさに一騎当千の働き。' },                                  // dlg_000069
  { idx: 4, cat: 'praise', text: '獅子奮迅！その戦いぶり、胸が熱くなります！' },                    // dlg_000070
  { idx: 4, cat: 'praise', text: '一騎当千の働きです！道が開きました！' },                          // dlg_000006
  { idx: 5, cat: 'praise', text: '素晴らしい！僕の想定を超えてくるとは、実に面白い！' },            // dlg_000071
  { idx: 6, cat: 'praise', text: 'すごいすごい！今ので一気に流れ変わったよ！' },                    // dlg_000072
  { idx: 7, cat: 'praise', text: 'チッ……派手に燃やすじゃねえか。嫌いじゃねえ。' },                 // dlg_000073
  // parallel_run (並走時)
  { idx: 6, cat: 'companion', text: 'いい感じ！そのまま一緒に行こ、無理はしないでね！' },           // dlg_000008
  { idx: 0, cat: 'companion', text: 'いい足だ。その調子なら、前線まで一気に押せるぞ！' },           // dlg_000074
  { idx: 0, cat: 'companion', text: '横は俺が見る。お前は迷わず前を向け！' },                       // dlg_000075
  { idx: 0, cat: 'companion', text: 'よし、呼吸は合ってる。このまま道を作るぞ！' },                 // dlg_000076
  { idx: 1, cat: 'companion', text: 'いいねえ、こういう並走感！なんか勝てる気しかしねえ！' },       // dlg_000077
  { idx: 1, cat: 'companion', text: '俺たち、けっこう息合ってきたんじゃないか？' },                 // dlg_000078
  { idx: 1, cat: 'companion', text: 'おいおい速いな！置いてくなよ、主役さん！' },                   // dlg_000079
  { idx: 2, cat: 'companion', text: '無理なさらないで。ですが、その歩調は頼もしいですわ。' },       // dlg_000080
  { idx: 2, cat: 'companion', text: 'そばにいれば、応急処置くらいはできます。安心なさい。' },       // dlg_000081
  { idx: 2, cat: 'companion', text: 'あなたとなら、この道も少しだけ安全に見えますわね。' },         // dlg_000082
  { idx: 3, cat: 'companion', text: '歩を乱すな。よい間合いだ。' },                                 // dlg_000083
  { idx: 3, cat: 'companion', text: 'そなたの背、預かろう。' },                                     // dlg_000084
  { idx: 3, cat: 'companion', text: '進め。曲者あらば、斬る。' },                                   // dlg_000085
  { idx: 4, cat: 'companion', text: '堅忍不抜です！このまま一歩ずつ進みましょう！' },               // dlg_000086
  { idx: 4, cat: 'companion', text: '勇往邁進です！共に進めば、道は開けます！' },                   // dlg_000087
  { idx: 4, cat: 'companion', text: '一意専心の歩みです。実に頼もしいです！' },                     // dlg_000088
  { idx: 5, cat: 'companion', text: 'いい位置取りだ。君は僕の読みを自然に補ってくるね。' },         // dlg_000089
  { idx: 5, cat: 'companion', text: 'この歩調なら、次の接敵も優位に運べる。' },                     // dlg_000090
  { idx: 5, cat: 'companion', text: '面白いな。君と並ぶと、作戦の幅が広がるよ。' },                 // dlg_000091
  { idx: 6, cat: 'companion', text: 'よしよし、いい感じ！このまま一緒に行こ！' },                   // dlg_000092
  { idx: 6, cat: 'companion', text: '近くにいると安心するね。ちゃんとついてくよ！' },               // dlg_000093
  { idx: 6, cat: 'companion', text: 'なんか今、流れいいよ！このまま押しちゃお！' },                 // dlg_000094
  { idx: 7, cat: 'companion', text: '離れるなよ。……別に心配してるわけじゃねえ。' },                // dlg_000095
  { idx: 7, cat: 'companion', text: '悪くねえ動きだ。そのまま合わせろ。' },                         // dlg_000096
  { idx: 7, cat: 'companion', text: 'チッ……調子いいじゃねえか。なら、俺も付き合ってやる。' },      // dlg_000097
  // left_alone (遠くで放置時)
  { idx: 7, cat: 'neglectFar', text: 'チッ……こっちは詰まってる。助けに来いとは言ってねえぞ。' },    // dlg_000009
  { idx: 0, cat: 'neglectFar', text: 'こっちはまだ持つ！だが、そろそろ援護が欲しいところだ！' },     // dlg_000122
  { idx: 0, cat: 'neglectFar', text: 'お前の手が空いたら、こっちにも顔出せ！前線を押し返す！' },     // dlg_000123
  { idx: 0, cat: 'neglectFar', text: 'まだ崩れちゃいねえ！来てくれりゃ、一気に巻き返せる！' },       // dlg_000124
  { idx: 1, cat: 'neglectFar', text: 'こっち、ちょっと寂しくなってきたぞー！援護待ってるぜ！' },     // dlg_000125
  { idx: 1, cat: 'neglectFar', text: 'おーい、俺の勇姿を見に来るなら今だぞ！' },                     // dlg_000126
  { idx: 1, cat: 'neglectFar', text: 'まだ耐えてる！けど、そろそろ主役の登場が欲しいな！' },         // dlg_000127
  { idx: 2, cat: 'neglectFar', text: 'こちらは持ちこたえています。ただ、長くは保ちませんわ。' },     // dlg_000128
  { idx: 2, cat: 'neglectFar', text: '余裕があれば、こちらへ。負傷者を出す前に整えたいですわ。' },   // dlg_000129
  { idx: 2, cat: 'neglectFar', text: '前線が少し重くなっています。無理のない範囲で援護を。' },       // dlg_000130
  { idx: 3, cat: 'neglectFar', text: 'こちら、敵勢多し。助太刀を請う。' },                           // dlg_000131
  { idx: 3, cat: 'neglectFar', text: 'まだ退かぬ。されど、援軍あらば心強い。' },                     // dlg_000132
  { idx: 3, cat: 'neglectFar', text: '曲者ども、数を増した。頃合いを見て来られよ。' },               // dlg_000133
  { idx: 4, cat: 'neglectFar', text: '孤軍奮闘中です！援護があれば、必ず押し返せます！' },           // dlg_000134
  { idx: 4, cat: 'neglectFar', text: '敵勢増加、油断大敵です！こちらも支えます！' },                 // dlg_000135
  { idx: 4, cat: 'neglectFar', text: '不撓不屈で耐えています！合流できれば、一気呵成です！' },       // dlg_000136
  { idx: 5, cat: 'neglectFar', text: 'こちらの圧が上がっている。君が来れば、形勢は変えられる。' },   // dlg_000137
  { idx: 5, cat: 'neglectFar', text: 'ふむ、少し読みより重いね。君の一手が欲しいところだ。' },       // dlg_000138
  { idx: 5, cat: 'neglectFar', text: '前線が停滞している。君が入れば、綺麗に崩せるはずだ。' },       // dlg_000139
  { idx: 6, cat: 'neglectFar', text: 'こっち、ちょっと大変かも！来られそうならお願い！' },           // dlg_000140
  { idx: 6, cat: 'neglectFar', text: 'まだ大丈夫！でも、来てくれたらすっごく助かる！' },             // dlg_000141
  { idx: 6, cat: 'neglectFar', text: 'うーん、少し止まってる！一緒ならたぶん押せるよ！' },           // dlg_000142
  { idx: 7, cat: 'neglectFar', text: 'チッ……こっちは詰まってる。来られるなら来い。' },              // dlg_000143
  { idx: 7, cat: 'neglectFar', text: 'まだ潰れてねえ。だが、そろそろ手を貸せ。' },                   // dlg_000144
  { idx: 7, cat: 'neglectFar', text: '敵が増えてきた。……無理して来いとは言ってねえぞ。' },          // dlg_000145
  // rescue_returned (救助者を拠点へ保護した時) ※新シーン
  { idx: 0, cat: 'rescueReturned', text: 'よく連れてきた！こいつは俺たちで守る、安心しろ！' },       // dlg_000058
  { idx: 1, cat: 'rescueReturned', text: 'おお、生存者だ！よく戻したな、今日いちばんの手柄かもな！' }, // dlg_000059
  { idx: 2, cat: 'rescueReturned', text: 'ご無事で何よりですわ。あなたも、よく守り抜きました。' },   // dlg_000060
  { idx: 2, cat: 'rescueReturned', text: 'たった一人でも、戻れた命には意味がありますわ。' },          // dlg_000004
  { idx: 3, cat: 'rescueReturned', text: '生者、保護した。そなたの働き、しかと見届けた。' },         // dlg_000061
  { idx: 4, cat: 'rescueReturned', text: '人命救助、誠心誠意の成果です！本当に見事でした！' },       // dlg_000062
  { idx: 5, cat: 'rescueReturned', text: '救助成功だ。君の判断で、拠点の価値が一段上がったね。' },   // dlg_000063
  { idx: 6, cat: 'rescueReturned', text: 'よかった、生きてた！連れてきてくれて本当にありがと！' },   // dlg_000064
  { idx: 7, cat: 'rescueReturned', text: 'チッ……よく生きて戻したな。こいつは俺たちで見る。' },      // dlg_000065
  // npc_enemy_kill (NPCが敵を自分で倒した時) ※新シーン
  { idx: 0, cat: 'npcKill', text: '一体片づけた！このまま前線を押し上げるぞ！' },                   // dlg_000098
  { idx: 0, cat: 'npcKill', text: 'こっちは任せろ！お前は自分の道を切り開け！' },                   // dlg_000099
  { idx: 0, cat: 'npcKill', text: 'よし、道が空いた！今なら進める！' },                             // dlg_000100
  { idx: 1, cat: 'npcKill', text: 'はい一丁上がり！俺だってやる時はやるんだぜ！' },                 // dlg_000101
  { idx: 1, cat: 'npcKill', text: '見たか今の！いや、見てなくても褒めていいぞ！' },                 // dlg_000102
  { idx: 1, cat: 'npcKill', text: 'こっちは片づいた！次もこの調子でいこうぜ！' },                   // dlg_000103
  { idx: 2, cat: 'npcKill', text: '排除しましたわ。これで少しは安全になります。' },                 // dlg_000104
  { idx: 2, cat: 'npcKill', text: '近づきすぎですわね。無作法な敵は下がっていただきます。' },       // dlg_000105
  { idx: 2, cat: 'npcKill', text: 'ひとまず片づけました。負傷者を出すわけにはいきませんもの。' },   // dlg_000106
  { idx: 3, cat: 'npcKill', text: '斬った。進むぞ。' },                                             // dlg_000107
  { idx: 3, cat: 'npcKill', text: '曲者、討ち取った。' },                                           // dlg_000108
  { idx: 3, cat: 'npcKill', text: '一太刀にて仕留めた。道は開いた。' },                             // dlg_000109
  { idx: 4, cat: 'npcKill', text: '電光石火です！敵を一体、撃破しました！' },                       // dlg_000110
  { idx: 4, cat: 'npcKill', text: '勇猛果敢に参ります！この道は通します！' },                       // dlg_000111
  { idx: 4, cat: 'npcKill', text: '百戦錬磨とはいきませんが、今の一撃は決まりました！' },           // dlg_000112
  { idx: 5, cat: 'npcKill', text: '予測通りだ。あの位置なら、僕が取れる。' },                       // dlg_000113
  { idx: 5, cat: 'npcKill', text: '一体排除。ふふ、読みが噛み合ってきたね。' },                     // dlg_000114
  { idx: 5, cat: 'npcKill', text: 'これで局面は少し軽くなる。次の手に移ろう。' },                   // dlg_000115
  { idx: 6, cat: 'npcKill', text: 'やった、倒せた！このまま進めるよ！' },                           // dlg_000116
  { idx: 6, cat: 'npcKill', text: 'こっちは大丈夫！ちゃんと道、作れてる！' },                       // dlg_000117
  { idx: 6, cat: 'npcKill', text: 'よし、一体片づいた！ちょっと自信ついてきたかも！' },             // dlg_000118
  { idx: 7, cat: 'npcKill', text: 'チッ……邪魔だ。消えろ。' },                                      // dlg_000119
  { idx: 7, cat: 'npcKill', text: '一体潰した。こっちはまだ動ける。' },                             // dlg_000120
  { idx: 7, cat: 'npcKill', text: '俺の前に出たのが悪い。次だ。' },                                 // dlg_000121
];

// (idx, cat) のバリアントからランダムに1つ返す。無ければ fallback(既存1文)。
export const pickNpcLine = (idx: number, cat: string, fallback: string): string => {
  const v = NPC_SCENE_VARIANTS.filter(x => x.idx === idx && x.cat === cat);
  if (v.length === 0) return fallback;
  return v[Math.floor(Math.random() * v.length)].text;
};
