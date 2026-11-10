import json
import sys
from pathlib import Path

import openpyxl


POS_NAMES = {
    "名": "名詞",
    "動": "動詞",
    "形": "形容詞",
    "副": "副詞",
    "前": "前置詞",
    "冠": "冠詞",
    "代": "代名詞",
    "接": "接続詞",
    "間": "間投詞",
}


def convert(source: Path, destination: Path) -> None:
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = workbook["はば単のみ"]
    words = []

    for row in sheet.iter_rows(min_row=3, values_only=True):
        if not any(value is not None for value in row):
            continue

        number, word, star, part_of_speech, meaning, example = row
        if number is None or word is None or meaning is None:
            raise ValueError(f"必須データが欠けています: {row!r}")

        source_pos = "" if part_of_speech is None else str(part_of_speech)
        pos_codes = source_pos.split("・") if source_pos else []
        pos_names = [POS_NAMES[code] for code in pos_codes if code in POS_NAMES]
        if not pos_names:
            pos_names = ["その他"]

        words.append(
            {
                "id": f"w-{int(number)}",
                "sourceNo": int(number),
                "word": str(word),
                "starred": star == "☆",
                "posSource": source_pos,
                "partsOfSpeech": pos_names,
                "meaning": str(meaning),
                "example": "" if example is None else str(example),
            }
        )

    if len({word["id"] for word in words}) != len(words):
        raise ValueError("No.から生成したIDが重複しています")

    payload = json.dumps(words, ensure_ascii=False, indent=2)
    destination.write_text(
        "// 添付Excelの『はば単のみ』シートから機械変換したデータです。\n"
        "// 単語・意味・品詞・用例・☆は元データを変更していません。\n"
        f"window.WORD_DATA = {payload};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: convert_excel.py SOURCE.xlsx DESTINATION.js")
    convert(Path(sys.argv[1]), Path(sys.argv[2]))
