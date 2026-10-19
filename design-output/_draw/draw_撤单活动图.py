import sys
sys.path.insert(0, os.path.expanduser(r"~\.qoder-cn\skills\draw-tech-diagram\scripts"))
from draw_scaffold import *

OUT = r"design-output/8272cf3bb598322a3b58891e0e6905ba"

W, H = 1440, 1330
c = Canvas(W, H)
c.header("撤单功能活动图", "在线订餐管理系统 —— 顾客发起撤单后的业务流程与控制流")
c.legend([("顾客分区", BLUE), ("订单系统分区", GREEN), ("商家与支付分区", AMBER), ("判定分支", RED)])

c.lane(56, 140, 430, 1090, "① 顾客（发起者）", label_color="#2563eb")
c.lane(450, 140, 950, 1090, "② 订单系统（订单服务 / 库存 / 撤单流水）", label_color="#16a34a")
c.lane(970, 140, 1384, 1090, "③ 商家端与支付渠道", label_color="#d97706")

CX_C, CX_S, CX_P = 243, 700, 1177
NW, NH = 200, 46
DW, DH = 170, 62
G, A, B, R = GREEN[1], AMBER[1], BLUE[1], RED[1]

# ---------- 顾客分区 ----------
c.node(CX_C, 200, 96, 32, "开始", "", BLUE, kind="pill")
c.node(CX_C, 262, NW, NH, "进入我的订单", "", BLUE)
c.node(CX_C, 322, NW, NH, "选择待撤订单", "", BLUE)
c.node(CX_C, 382, NW, NH, "提交撤单申请", "填写撤单原因", BLUE)
c.node(CX_C, 545, NW, NH, "提示不可撤单", "流程终止", RED)
c.node(CX_C, 1000, NW, NH, "收到撤单结果", "订单已撤销", BLUE)
c.node(CX_C, 1062, 96, 32, "结束", "", BLUE, kind="pill")

# ---------- 订单系统分区 ----------
c.node(CX_S, 442, NW, NH, "校验订单状态", "读取状态与时限", GREEN)
c.node(CX_S, 545, DW, DH, "可撤销？", "", AMBER, kind="diamond")
c.node(CX_S, 640, NW, NH, "更新为已撤销", "", GREEN)
c.node(CX_S, 700, NW, NH, "释放菜品库存", "", GREEN)
c.node(CX_S, 775, DW, DH, "已支付？", "", AMBER, kind="diamond")
c.node(CX_S, 855, NW, NH, "生成退款单", "金额与渠道流水号", GREEN)
c.node(CX_S, 960, NW, NH, "记录撤单流水", "操作人时间与原因", GREEN)
c.node(CX_S, 1020, NW, NH, "推送撤单通知", "", GREEN)

# ---------- 商家与支付分区 ----------
c.node(CX_P, 670, 210, NH, "商家端接收提醒", "停止备餐", AMBER)
c.node(CX_P, 895, 210, NH, "渠道退款处理", "原路退回", AMBER)
c.node(CX_P, 975, DW, DH, "退款成功？", "", RED, kind="diamond")
c.node(CX_P, 1042, 210, NH, "转人工核销", "挂起待处理", RED)

# ---------- 控制流 ----------
c.edge((CX_C, 216), (CX_C, 239), INK2)
c.edge((CX_C, 285), (CX_C, 299), INK2)
c.edge((CX_C, 345), (CX_C, 359), INK2)
c.polyline([(CX_C, 405), (CX_C, 442), (CX_S - 100, 442)], G)
c.edge((CX_S, 465), (CX_S, 514), G)
c.polyline([(CX_S - DW / 2, 545), (CX_C + 100, 545)], R, dash=(6, 4))
c.tag(478, 515, "否", "#dc2626")
c.tag(800, 515, "是", "#16a34a")
c.edge((CX_S, 576), (CX_S, 617), G)
c.edge((CX_S, 663), (CX_S, 677), G)
c.polyline([(CX_S + 100, 650), (CX_P - 105, 665)], A, dash=(6, 4))
c.edge((CX_S, 723), (CX_S, 744), G)
c.edge((CX_S, 806), (CX_S, 832), G)
c.tag(812, 815, "是（已支付）", "#d97706")
c.polyline([(CX_S - DW / 2, 775), (520, 775), (520, 960), (CX_S - 100, 960)], G, dash=(6, 4))
c.tag(566, 750, "否", "#475569")
c.polyline([(CX_S + 100, 855), (CX_P - 105, 880)], A)
c.edge((CX_P, 918), (CX_P, 944), A)
c.polyline([(CX_P, 1006), (CX_P, 1019)], R)
c.tag(1290, 1000, "否", "#dc2626")
c.polyline([(CX_P - 85, 975), (CX_S + 100, 963)], G)
c.tag(1010, 932, "是", "#16a34a")
c.edge((CX_S, 983), (CX_S, 997), G)
c.polyline([(CX_S - 100, 1015), (CX_C + 100, 1000)], B)
c.edge((CX_C, 1023), (CX_C, 1044), B)
c.polyline([(143, 545), (110, 545), (110, 1062), (195, 1062)], R, dash=(6, 4))
c.tag(110, 800, "终止", "#dc2626")

bottom = c.footer(56, 1108, 1384, "关键约束", [
    "1. 可撤销的条件是「商家未接单」或「接单后未超过时限」，任一成立即走是分支，否则走否分支终止并提示原因。",
    "2. 已支付的订单必须先出退款单再记流水；退款失败不进主流程，转人工核销队列，避免订单已撤但钱未退。",
    "3. 更新订单状态与释放库存落在同一个事务里，撤单流水后写，保证通知发出时状态已经落库。",
    "4. 实线表示同一分区内的顺序控制流，虚线表示跨分区触发（商家提醒、渠道退款、人工核销）。"])
c.save("活动图_撤单业务流程.png", out_dir=OUT)
print("bottom =", bottom, "H =", H)
