import os, sys
sys.path.insert(0, os.path.expanduser(r"~\.qoder-cn\skills\draw-tech-diagram\scripts"))
from draw_scaffold import *

OUT = "diagrams"
os.makedirs(OUT, exist_ok=True)
W, H = 1440, 880

c = Canvas(W, H)
c.header("切窗口就停：谁按的暂停，面板为什么没接手",
         "海浪智学任务面板 v0.3.2 → v0.3.3 · 9225 实例同页 A/B 实测")
c.legend([("老路径卡住的地方", RED), ("判据", AMBER), ("新路径", GREEN), ("兜底", BLUE)])

c.lane(56, 112, 1384, 400, "v0.3.2 接手路径（你遇到的）")
n1 = c.node(180, 250, 190, 62, "切窗口 / 切标签", "不产生页内事件", GRAY)
n2 = c.node(450, 250, 210, 62, "站点播放器自己 pause", "d-player 失焦即停", RED)
n3 = c.node(760, 250, 240, 62, "判据 reallyHidden()", "伪装层只改 JS 读到的值", AMBER)
n4 = c.node(1120, 178, 380, 60, "native visible → 直接 return", "= 你看到的「直接暂停」", RED)
n5 = c.node(1120, 330, 380, 60, "native hidden → setTimeout(400)", "无节流豁免时定时器迟到", AMBER)
c.edge((275, 250), (345, 250), INK2)
c.edge((555, 250), (640, 250), INK2)
c.edge((880, 235), (925, 178), RED[1])
c.edge((880, 265), (925, 330), AMBER[1])
c.tag(900, 150, "主因·实测复现", RED[1])
c.tag(900, 372, "次因·未实测到", AMBER[1])

c.lane(56, 420, 1384, 660, "v0.3.3 接手路径（改完）")
m1 = c.node(180, 545, 190, 62, "pause 事件", "同一条捕获监听", GRAY)
m2 = c.node(470, 545, 250, 62, "resumable() 只问两件事", "你 3 秒内碰过播放器？到片尾？", GREEN)
m3 = c.node(800, 545, 240, 62, "同步 play()", "在同一事件里，不靠定时器", GREEN)
m4 = c.node(1160, 488, 300, 54, "2 秒兜底重试", "只在仍 paused 且非用户意图时", BLUE)
m5 = c.node(1160, 602, 300, 54, "标签挂起 → resume 补播", "内存节省模式冻结 JS 的场景", BLUE)
c.edge((275, 545), (345, 545), INK2)
c.edge((595, 545), (680, 545), INK2)
c.edge((920, 530), (1005, 488), BLUE[1])
c.edge((920, 560), (1005, 602), BLUE[1])

c.footer(56, 676, 1384, "同页受控对照（native visible，只换构建）",
         ["v0.3.2：程序化 pause 后 300 / 1200 / 2600 ms 全是「停」，接手计数 0 → 复现症状",
          "v0.3.3：同一条 pause，300 ms 内已「播」，计数 0 → 2；可信点击 .d-play-btn 的暂停留得住，计数不动",
          "另验：最小化 20 秒，进度 660.4 → 700.4（2 倍速 1:1 推进）、心跳 2 次 —— 该实例带遮挡豁免参数，不能搬到你自己的 Chrome"])
p = c.save("切窗口暂停成因与修复", kind="arch", out_dir=OUT)
print("saved:", p)
for w in c.warnings:
    print("WARN:", w)
