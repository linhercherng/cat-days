"""Normalize preserved DGPA CSVs without guessing holiday dates or names."""
from pathlib import Path
import csv
import hashlib
import io
import json

root = Path(__file__).resolve().parents[1]
source_files = {
    2025: ('cp950', '202510/b84cb88a-803c-4621-a843-d637b2775615.csv', '1141020 修正版'),
    2026: ('utf-8-sig', '202506/a52331bd-a189-466b-b0f0-cae3062bbf74.csv', '115 年年度檔'),
    2027: ('utf-8-sig', '202607/f538b1ff-ba60-4c63-9477-10db8e6612d1.csv', '116 年年度檔'),
}
data = {'version': 1, 'checkedAt': '2026-10-10', 'dataset': 'https://data.gov.tw/dataset/14718',
        'license': '政府資料開放授權條款-第1版', 'sources': {}, 'days': {}}
for year, (encoding, filename, label) in source_files.items():
    raw = (root / f'assets/holidays/source/{year}.csv').read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode(encoding))))
    data['sources'][str(year)] = {
        'url': 'https://www.dgpa.gov.tw/FileConversion?filename=dgpa%2Ffiles%2F' + filename.replace('/', '%2F') + '&nfix=',
        'label': label, 'encoding': encoding, 'sha256': hashlib.sha256(raw).hexdigest(), 'rows': len(rows),
    }
    for row in rows:
        value = row['西元日期']
        date = f'{value[:4]}-{value[4:6]}-{value[6:]}'
        if date in data['days']:
            raise ValueError(f'Duplicate date: {date}')
        data['days'][date] = [int(row['是否放假']), row['備註']]
(root / 'assets/holidays/taiwan.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(data["days"])} dates')
