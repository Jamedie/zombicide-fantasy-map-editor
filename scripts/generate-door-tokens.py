from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app" / "assets" / "tokens"
OUTPUT = ROOT / "output" / "pdf" / "tokens-portes-zombicide-a4.pdf"

TOKEN_PAIRS = (
    [("doors/door-closed-red.png", "doors/door-open-red.png")] * 12
    + [("doors/door-closed-blue.png", "doors/door-open-blue.png")]
    + [("doors/door-closed-green.png", "doors/door-open-green.png")]
    + [("black-plague/vault-door-closed-purple.png", "black-plague/vault-door-open-purple.png")] * 2
    + [("black-plague/vault-door-closed-yellow.png", "black-plague/vault-door-open-yellow.png")] * 2
)

COLS = 6
ROWS = 3
TOKEN_MAX = 25 * mm
CELL_W = 29 * mm
CELL_H = 31 * mm
CROP = 2.5 * mm
CROP_GAP = 0.8 * mm


def positions():
    page_w, page_h = A4
    grid_w = COLS * CELL_W
    grid_h = ROWS * CELL_H
    left = (page_w - grid_w) / 2
    bottom = (page_h - grid_h) / 2
    for index in range(len(TOKEN_PAIRS)):
        row, col = divmod(index, COLS)
        yield left + (col + 0.5) * CELL_W, bottom + (ROWS - row - 0.5) * CELL_H


def image_size(filename):
    if Path(filename).name.startswith("vault-"):
        return TOKEN_MAX, TOKEN_MAX
    return TOKEN_MAX, TOKEN_MAX * 33 / 36


def crop_marks(pdf, cx, cy, width, height):
    left, right = cx - width / 2, cx + width / 2
    bottom, top = cy - height / 2, cy + height / 2
    pdf.setStrokeColorRGB(0.72, 0.72, 0.72)
    pdf.setLineWidth(0.15 * mm)
    for x, direction in ((left, -1), (right, 1)):
        pdf.line(x + direction * CROP_GAP, bottom, x + direction * (CROP_GAP + CROP), bottom)
        pdf.line(x + direction * CROP_GAP, top, x + direction * (CROP_GAP + CROP), top)
    for y, direction in ((bottom, -1), (top, 1)):
        pdf.line(left, y + direction * CROP_GAP, left, y + direction * (CROP_GAP + CROP))
        pdf.line(right, y + direction * CROP_GAP, right, y + direction * (CROP_GAP + CROP))


def draw_page(pdf, side):
    page_w, _ = A4
    front_positions = list(positions())
    for index, (closed, opened) in enumerate(TOKEN_PAIRS):
        filename = closed if side == "front" else opened
        cx, cy = front_positions[index]
        if side == "back":
            cx = page_w - cx
        width, height = image_size(filename)
        pdf.drawImage(
            str(ASSETS / filename),
            cx - width / 2,
            cy - height / 2,
            width=width,
            height=height,
            preserveAspectRatio=True,
            mask="auto",
        )
        crop_marks(pdf, cx, cy, width, height)
    pdf.showPage()


def main():
    missing = sorted({name for pair in TOKEN_PAIRS for name in pair if not (ASSETS / name).is_file()})
    if missing:
        raise FileNotFoundError(f"Missing token assets: {', '.join(missing)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    pdf.setTitle("Tokens portes Zombicide Fantasy - recto verso")
    pdf.setAuthor("Zombicide Fantasy Map Editor")
    draw_page(pdf, "front")
    draw_page(pdf, "back")
    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
