"""웹 데모용 Pretendard woff2 만들기 — assets/fonts/*.otf 를 줄여 public/fonts/*.woff2 로 쓴다.

앱(네이티브)은 OTF 원본을 그대로 번들하지만, 웹은 4개 합쳐 6MB 라 너무 무겁다. KS X 1001 완성형 한글 2,350자 +
기본 라틴·숫자·문장 부호·자주 쓰는 기호만 남긴다(나머지 글자는 브라우저 기본 글꼴로 보인다). Pretendard 는 SIL OFL 1.1
이라 줄인 글꼴을 함께 배포해도 된다(라이선스 전문은 public/fonts/Pretendard-LICENSE.txt).

사용: python scripts/build-web-fonts.py   (fonttools, brotli 필요: pip install fonttools brotli)
"""
import shutil
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "fonts"
OUT = ROOT / "public" / "fonts"
WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"]


def ksx1001_hangul() -> str:
    """EUC-KR 두 바이트 B0A1–C8FE 가 완성형 한글 2,350자다."""
    chars = []
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            try:
                chars.append(bytes([lead, trail]).decode("euc-kr"))
            except UnicodeDecodeError:
                pass
    return "".join(chars)


def text_to_keep() -> str:
    basic = "".join(chr(c) for c in range(0x20, 0x7F))  # ASCII
    latin1 = "".join(chr(c) for c in range(0xA0, 0x100))
    jamo = "".join(chr(c) for c in range(0x3131, 0x3164))  # ㄱ~ㅣ
    symbols = "·•…‘’“”–—→←↑↓※○●◎◇◆□■△▲▽▼☆★♡♥✓✕×÷₩€°"
    return basic + latin1 + jamo + symbols + ksx1001_hangul()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    keep = text_to_keep()
    for weight in WEIGHTS:
        src = SRC / f"Pretendard-{weight}.otf"
        dst = OUT / f"Pretendard-{weight}.woff2"
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True
        font = subset.load_font(str(src), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=keep)
        subsetter.subset(font)
        subset.save_font(font, str(dst), options)
        print(f"{dst.name}: {dst.stat().st_size // 1024} KB")
    shutil.copyfile(SRC / "Pretendard-LICENSE.txt", OUT / "Pretendard-LICENSE.txt")


if __name__ == "__main__":
    main()
