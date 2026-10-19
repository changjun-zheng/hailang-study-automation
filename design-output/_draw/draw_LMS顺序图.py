import os, sys
sys.path.insert(0, os.path.expanduser(r"~\.qoder-cn\skills\draw-tech-diagram\scripts"))
from draw_scaffold import *

OUT = r"design-output/7074dbf6d745833dde822f8c73671e56"
MS, STEP, Y0, SHIFT = 12, 46, 246, 30
W, H = 1440, 1340


def yy(row):
    """行号 -> y 坐标。第 6、7 行各再加一档行距，给 alt 两个操作数的守卫文字留出空间。"""
    return Y0 + row * STEP + (SHIFT if row >= 6 else 0) + (SHIFT if row >= 7 else 0)


def obj(c, x, y, title, sub, pal, w=160):
    c.node(x, y, w, 50, title, sub, pal)


def life(c, x, y1, y2):
    c.edge((x, y1), (x, y2), INK3, width=1.3, dash=(5, 5), head=False)


def act(c, x, y1, y2, col):
    c.rect(x - 5.5, y1, x + 5.5, y2, fill=col, outline=col, width=1, radius=4)


def msg(c, col, a, b, row, label, kind="call"):
    x1, x2 = col[a], col[b]
    y = yy(row)
    cc = {"call": INK2, "ret": "#647488", "create": "#7c3aed"}[kind]
    if kind in ("ret", "create"):
        c.edge((x1, y), (x2, y), cc, width=1.7, dash=(6, 4))
    else:
        c.edge((x1, y), (x2, y), cc, width=1.9)
    if c.tw(label, MS) > abs(x2 - x1) + 150:
        c.warnings.append("消息标签过长：%s" % label)
    c.text((x1 + x2) / 2, y - 19, label, size=MS, color=cc, anchor="ma")


def kill(c, x, y):
    c.edge((x - 11, y - 11), (x + 11, y + 11), "#dc2626", width=2.4, head=False)
    c.edge((x - 11, y + 11), (x + 11, y - 11), "#dc2626", width=2.4, head=False)


def new_canvas(title, sub):
    c = Canvas(W, H)
    c.header(title, sub)
    c.legend([("调用消息", BLUE), ("返回消息", GRAY), ("创建 / 销毁", PURPLE), ("alt 组合分片", RED)])
    return c


def alt_box(c, x1, x2, first_row, second_row, bottom_row, cond_a, cond_b):
    """first_row 操作数上方与 second_row 操作数上方各留一行给守卫文字。"""
    top = yy(first_row) - 52
    split = yy(first_row) + 24
    bot = yy(bottom_row) + 26
    c.rect(x1, top, x2, bot, fill=None, outline="#dc2626", width=1.6, dash=(7, 5))
    c.tag(x1 + 120, top - 14, "alt 组合分片", "#dc2626")
    c.edge((x1, split), (x2, split), "#dc2626", width=1.3, dash=(7, 5), head=False)
    c.text(x1 + 12, top + 8, cond_a, size=12.5, color="#dc2626")
    c.text(x1 + 12, split + 8, cond_b, size=12.5, color="#dc2626")


# ==================== 图一：图书借阅 ====================
C1 = {"r": 110, "ui": 310, "ctl": 510, "book": 730, "loan": 950, "tx": 1150, "db": 1330}
c = new_canvas("顺序图：图书借阅", "图书馆管理系统 —— 读者提交借阅后各对象间的消息时序与生命周期")
obj(c, C1["r"], 160, ":读者", "Actor", GRAY)
obj(c, C1["ui"], 160, ":借阅界面", "边界对象", BLUE)
obj(c, C1["ctl"], 160, ":借阅控制器", "控制对象", GREEN)
obj(c, C1["book"], 160, ":图书服务", "实体服务", PURPLE)
obj(c, C1["loan"], 160, ":借阅记录服务", "实体服务", PURPLE)
obj(c, C1["db"], 160, ":数据库", "<<database>>", AMBER)
for k, x in C1.items():
    if k != "tx":
        life(c, x, 190, 990)
act(c, C1["ui"], yy(0) - 12, yy(14) + 12, BLUE[1])
act(c, C1["ctl"], yy(1) - 4, yy(13) + 12, GREEN[1])
act(c, C1["book"], yy(2) - 4, yy(11) + 10, PURPLE[1])
act(c, C1["loan"], yy(8) - 4, yy(10) + 10, PURPLE[1])
act(c, C1["db"], yy(3) - 4, yy(10) + 10, AMBER[1])

msg(c, C1, "r", "ui", 0, "1: inputInfo(isbn, cardNo)")
msg(c, C1, "ui", "ctl", 1, "2: borrow(isbn, cardNo)")
msg(c, C1, "ctl", "book", 2, "3: getBook(isbn)")
msg(c, C1, "book", "db", 3, "4: SELECT t_book")
msg(c, C1, "db", "book", 4, "5: Book", "ret")
msg(c, C1, "book", "ctl", 5, "6: 库存与状态", "ret")
msg(c, C1, "book", "ctl", 6, "7a: 返回不可借", "ret")
msg(c, C1, "ctl", "tx", 7, "7b: <<create>> 新建借书事务", "create")
msg(c, C1, "ctl", "loan", 8, "8: createLoan(r, b)")
msg(c, C1, "loan", "db", 9, "9: INSERT t_loan")
msg(c, C1, "db", "loan", 10, "10: loanId", "ret")
msg(c, C1, "ctl", "book", 11, "11: decreaseStock(bookId)")
msg(c, C1, "tx", "ctl", 12, "12: commit() <<destroy>>", "ret")
msg(c, C1, "ctl", "ui", 13, "13: 借阅成功(应还日期)", "ret")
msg(c, C1, "ui", "r", 14, "14: 显示借阅凭证", "ret")

obj(c, C1["tx"], yy(7) + 34, ":借书事务", "临时对象", ORANGE)
life(c, C1["tx"], yy(7) + 60, yy(12) - 18)
kill(c, C1["tx"], yy(12))
alt_box(c, C1["book"] - 130, C1["db"] + 78, 6, 7, 12,
        "[不可借：库存为 0 或状态不允许]", "[可借：新建事务、写记录、扣库存]")

bottom = c.footer(56, 1060, 1384, "读图要点", [
    "1. 对象按边界—控制—实体三层摆放：读者只与借阅界面通信，界面把请求交给借阅控制器，控制器再调度图书服务与借阅记录服务。",
    "2. 编号即时间顺序，实线箭头是调用、虚线箭头是返回；alt 分片把「不可借」与「可借」两条路径画在同一张图上，守卫条件写在每个操作数的左上角。",
    "3. :借书事务 在第 7b 步动态创建（对象框出现在生命线上而不是顶部），写记录与扣库存落在它的作用域内，第 12 步 commit 后销毁，X 表示生命周期结束。",
    "4. 第 13、14 两条返回画在分片之外，因为不论走哪个操作数，控制器最终都要把结果回给界面并由界面呈现给读者。",
    "5. 激活条（生命线上的竖条）表示对象正在执行操作，嵌套深度就是调用栈深度。"])
c.save("顺序图_图书借阅.png", out_dir=OUT)
print("图一 bottom =", bottom)

# ==================== 图二：用户注册 ====================
C2 = {"r": 110, "ui": 310, "ctl": 510, "val": 730, "usr": 950, "dto": 1150, "db": 1330}
c = new_canvas("顺序图：用户注册", "图书馆管理系统 —— 新读者注册时的对象交互、校验分支与生命周期")
obj(c, C2["r"], 160, ":读者", "Actor", GRAY)
obj(c, C2["ui"], 160, ":注册界面", "边界对象", BLUE)
obj(c, C2["ctl"], 160, ":用户控制器", "控制对象", GREEN)
obj(c, C2["val"], 160, ":校验服务", "实体服务", PURPLE)
obj(c, C2["usr"], 160, ":用户服务", "实体服务", PURPLE)
obj(c, C2["db"], 160, ":数据库", "<<database>>", AMBER)
for k, x in C2.items():
    if k != "dto":
        life(c, x, 190, 990)
act(c, C2["ui"], yy(0) - 12, yy(14) + 12, BLUE[1])
act(c, C2["ctl"], yy(2) - 4, yy(13) + 12, GREEN[1])
act(c, C2["val"], yy(3) - 4, yy(7) + 10, PURPLE[1])
act(c, C2["usr"], yy(8) - 4, yy(11) + 10, PURPLE[1])
act(c, C2["db"], yy(4) - 4, yy(10) + 10, AMBER[1])

msg(c, C2, "r", "ui", 0, "1: inputInfo(user)")
msg(c, C2, "ui", "dto", 1, "2: <<create>> 封装表单", "create")
msg(c, C2, "ui", "ctl", 2, "3: register(user)")
msg(c, C2, "ctl", "val", 3, "4: validate(user)")
msg(c, C2, "val", "db", 4, "5: SELECT byName")
msg(c, C2, "db", "val", 5, "6: 匹配结果", "ret")
msg(c, C2, "val", "ctl", 6, "7a: 校验不通过", "ret")
msg(c, C2, "val", "ctl", 7, "7b: 校验通过", "ret")
msg(c, C2, "ctl", "usr", 8, "8: save(user)")
msg(c, C2, "usr", "db", 9, "9: INSERT t_user")
msg(c, C2, "db", "usr", 10, "10: userId", "ret")
msg(c, C2, "usr", "ctl", 11, "11: 注册成功", "ret")
msg(c, C2, "dto", "ctl", 12, "12: <<destroy>> 销毁表单", "ret")
msg(c, C2, "ctl", "ui", 13, "13: 注册结果", "ret")
msg(c, C2, "ui", "r", 14, "14: 提示注册完成", "ret")

obj(c, C2["dto"], yy(1) + 34, ":注册表单DTO", "临时对象", ORANGE)
life(c, C2["dto"], yy(1) + 60, yy(12) - 18)
kill(c, C2["dto"], yy(12))
alt_box(c, C2["val"] - 130, C2["db"] + 78, 6, 7, 12,
        "[重名或格式非法：直接返回失败]", "[校验通过：加密后落库]")

bottom = c.footer(56, 1060, 1384, "读图要点", [
    "1. 注册与借阅共用同一套分层：读者只与注册界面通信，控制器负责编排校验与落库，界面不直接访问数据库。",
    "2. 用户名重复与格式非法合并成 7a 一条失败操作数，只有 7b 才真正写库，避免无效数据进数据库。",
    "3. :注册表单DTO 在界面收到输入的那一刻创建，随注册结果返回而销毁，它的生命周期正好覆盖一次注册请求。",
    "4. 密码加密在用户服务内部完成，不作为跨对象消息外露，图上只保留对象间的可见调用。"])
c.save("顺序图_用户注册.png", out_dir=OUT)
print("图二 bottom =", bottom)
