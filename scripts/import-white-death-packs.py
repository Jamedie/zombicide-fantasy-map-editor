#!/usr/bin/env python3
"""Import the official BuildAndPlay White Death packages into the editor.

The .pack files are Qt QDataStream containers. Their payloads use qCompress:
the first four bytes store the uncompressed size and the rest is zlib data.
"""

from __future__ import annotations

import argparse
import io
import struct
import zlib
from pathlib import Path

from PIL import Image, ImageChops


END_MARKERS = {"<End of pre-files>", "<End of files>"}
PINK_KEY = (255, 174, 201)


def read_qstring(data: bytes, offset: int) -> tuple[str, int]:
    if offset + 4 > len(data):
        raise ValueError("Chaîne Qt tronquée")
    byte_length = struct.unpack_from(">I", data, offset)[0]
    offset += 4
    end = offset + byte_length
    if byte_length % 2 or end > len(data):
        raise ValueError("Longueur de chaîne Qt invalide")
    return data[offset:end].decode("utf-16-be"), end


def unpack_package(package: Path) -> dict[str, bytes]:
    data = package.read_bytes()
    version, offset = read_qstring(data, 0)
    if version != "<Version 1>":
        raise ValueError(f"Version de package non prise en charge : {version}")

    files: dict[str, bytes] = {}
    while offset < len(data):
        name, offset = read_qstring(data, offset)
        if name in END_MARKERS:
            if name == "<End of files>":
                break
            continue
        if offset + 4 > len(data):
            raise ValueError(f"Taille manquante pour {name}")
        compressed_size = struct.unpack_from(">I", data, offset)[0]
        offset += 4
        payload = data[offset : offset + compressed_size]
        offset += compressed_size
        if not payload:
            files[name] = b""
            continue
        expected_size = struct.unpack_from(">I", payload, 0)[0]
        if len(payload) == 4 and expected_size == 0:
            files[name] = b""
            continue
        if len(payload) < 5:
            raise ValueError(f"Données compressées invalides pour {name}")
        raw = zlib.decompress(payload[4:])
        if len(raw) != expected_size:
            raise ValueError(f"Taille décompressée invalide pour {name}")
        files[name] = raw
    return files


def image(files: dict[str, bytes], name: str) -> Image.Image:
    try:
        return Image.open(io.BytesIO(files[name])).convert("RGB")
    except KeyError as error:
        raise ValueError(f"Image absente du package : {name}") from error


def save_png(value: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    value.save(path, "PNG", optimize=True)


def crop(files: dict[str, bytes], source: str, box: tuple[int, int, int, int]) -> Image.Image:
    x, y, width, height = box
    return image(files, source).crop((x, y, x + width, y + height))


def masked_crop(
    files: dict[str, bytes],
    source: str,
    mask_source: str,
    box: tuple[int, int, int, int],
) -> Image.Image:
    rgb = crop(files, source, box)
    mask = crop(files, mask_source, box).convert("L")
    alpha = ImageChops.invert(mask)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def chroma_key(value: Image.Image, key: tuple[int, int, int] = PINK_KEY) -> Image.Image:
    rgb = value.convert("RGB")
    pixels = list(rgb.get_flattened_data())
    alpha = Image.new("L", rgb.size)
    # The source uses a flat pink matte. A short transition keeps its antialiased edge.
    alpha.putdata([
        max(0, min(255, round((max(abs(pixel[i] - key[i]) for i in range(3)) - 2) * 255 / 28)))
        for pixel in pixels
    ])
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def import_tiles(files: dict[str, bytes], numbers: range, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for number in numbers:
        for face in ("R", "V"):
            source = image(files, f"{number}{face}.jpg")
            source.save(output / f"{number}{face}.webp", "WEBP", quality=92, method=6)


def import_white_death(files: dict[str, bytes], root: Path) -> None:
    tokens = root / "app/assets/tokens/white-death"
    tiles = root / "app/assets/tiles"
    import_tiles(files, range(26, 35), tiles)

    rectangular = {
        "spawn-1.png": ("WD_tokens.jpg", (92, 87, 764, 369)),
        "spawn-2.png": ("WD_tokens.jpg", (92, 596, 764, 369)),
        "spawn-3.png": ("WD_tokens.jpg", (92, 1059, 764, 369)),
        "spawn-4.png": ("WD_tokens.jpg", (101, 1552, 764, 369)),
        "spawn-defiler.png": ("WD_tokens.jpg", (1016, 574, 764, 369)),
        "exit.png": ("WD_tokens.jpg", (984, 87, 764, 369)),
        "flag-zone.png": ("WD_tokens.jpg", (1014, 1060, 764, 369)),
        "objective-red.png": ("WD_Objectives.jpg", (65, 1073, 569, 413)),
        "objective-green.png": ("WD_Objectives.jpg", (65, 65, 569, 413)),
        "objective-blue.png": ("WD_Objectives.jpg", (64, 568, 569, 413)),
    }
    for filename, (source, box) in rectangular.items():
        save_png(crop(files, source, box), tokens / filename)

    save_png(image(files, "WD_Start_token.jpg"), tokens / "start.png")
    save_png(chroma_key(image(files, "WD_Guard.png")), tokens / "guard.png")

    masked = {
        "rope-ladder.png": ("WD_tokens.jpg", "wd_tokens_mask.png", (987, 1596, 485, 467)),
        "cauldron.png": ("WD_tokens.jpg", "wd_tokens_mask.png", (1575, 1568, 466, 467)),
        "beacon.png": ("WD_tokens.jpg", "wd_tokens_mask.png", (1829, 1053, 473, 473)),
        "noise.png": ("WD_tokens.jpg", "wd_tokens_mask.png", (2097, 1588, 382, 348)),
        "corruption.png": ("WD_Corruption.jpg", "WD_Corruption_mask.png", (8, 2, 626, 779)),
    }
    for filename, (source, mask_source, box) in masked.items():
        save_png(masked_crop(files, source, mask_source, box), tokens / filename)


def import_eternal_empire(files: dict[str, bytes], root: Path) -> None:
    tokens = root / "app/assets/tokens/eternal-empire"
    tiles = root / "app/assets/tiles"
    import_tiles(files, range(35, 39), tiles)
    save_png(crop(files, "WDEE_Token02.png", (40, 38, 1551, 759)), tokens / "spawn-5.png")
    save_png(chroma_key(image(files, "WDEE_Token01.png")), tokens / "chi-statue.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("white_death", type=Path, help="Package White Death .pack")
    parser.add_argument("eternal_empire", type=Path, help="Package Eternal Empire .pack")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    import_white_death(unpack_package(args.white_death), args.root.resolve())
    import_eternal_empire(unpack_package(args.eternal_empire), args.root.resolve())
    print("Tuiles 26–38 et tokens White Death / Eternal Empire importés.")


if __name__ == "__main__":
    main()
