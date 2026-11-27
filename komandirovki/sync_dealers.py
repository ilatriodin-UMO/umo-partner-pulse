#!/usr/bin/env python3
"""Safely refresh only the dealer fields used by the public trip planner."""
import ast
import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
URL = ('https://docs.google.com/spreadsheets/d/'
       '1i7cio6Ub_wkq-Byp83m1T5WYuAKkRsVn1xOWaSyjMus/export?format=csv&gid=1705990534')
HEADERS = {1: 'Dlr ID', 3: 'Город', 14: 'Маркетинговое название', 16: 'Региональный менеджер'}
DEALERS_PATH = HERE / 'dealers.js'
ASSIGNMENTS_PATH = HERE / 'dealer-assignments.js'


def key(name, city):
    return (' '.join(name.casefold().split()), ' '.join(city.casefold().split()))


def read_current():
    # The combined snapshot is authoritative after the first automatic run.
    # The original directory is only a fallback for the initial migration.
    source = ASSIGNMENTS_PATH.read_text(encoding='utf-8') if ASSIGNMENTS_PATH.exists() else ''
    if 'window.UMO_DEALERS = Object.freeze(' not in source:
        source = DEALERS_PATH.read_text(encoding='utf-8')
    data = re.search(r'window\.UMO_DEALERS\s*=\s*Object\.freeze\((\[.*?\])\)\s*;', source, re.S)
    if not data:
        raise ValueError('Existing dealer list cannot be read')
    try:
        dealers = json.loads(data.group(1))
    except json.JSONDecodeError:
        # One-time compatibility with the original JavaScript literal format.
        quoted = r"('(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")"
        pattern = r'\{\s*id\s*:\s*' + quoted + r'\s*,\s*name\s*:\s*' + quoted + r'\s*,\s*city\s*:\s*' + quoted + r'\s*\}'
        dealers = [dict(zip(('id', 'name', 'city'), map(ast.literal_eval, m)))
                   for m in re.findall(pattern, data.group(1))]
        if len(dealers) != data.group(1).count('{'):
            raise ValueError('Existing dealer list has an unexpected format')
    if not dealers or len({d['id'] for d in dealers}) != len(dealers):
        raise ValueError('Existing dealer list is empty or contains duplicate IDs')
    return dealers


def get_rows():
    request = urllib.request.Request(URL, headers={'User-Agent': 'UMO-trip-planner-sync/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if 'text/csv' not in response.headers.get('Content-Type', ''):
            raise ValueError('Sheet did not return a CSV document')
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Sheet export is unexpectedly large')
    return list(csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline='')))


def prepare(rows, old):
    if not rows or any(len(rows[0]) <= i or rows[0][i].strip() != name for i, name in HEADERS.items()):
        raise ValueError('Sheet columns changed; refusing to overwrite data')
    by_id = {d['id']: d for d in old}
    by_name_city = {}
    for d in old:
        by_name_city.setdefault(key(d['name'], d['city']), []).append(d)
    result, assignments, used, sheet_ids = [], {}, set(), set()
    for number, row in enumerate(rows[1:], start=2):
        values = [row[i].strip() if len(row) > i else '' for i in (1, 3, 14, 16)]
        source_id, city, name, manager = values
        if not any(values):
            continue
        if not city or not name or not manager:
            raise ValueError(f'Row {number} is missing a city, dealer name or manager')
        if source_id and source_id in sheet_ids:
            raise ValueError(f'Row {number} has a duplicate source ID')
        sheet_ids.add(source_id)
        matches = by_name_city.get(key(name, city), [])
        if source_id in by_id:
            ident = source_id
        elif len(matches) == 1:
            # In particular, retain historical candidate-* IDs if the sheet adds an ID.
            ident = matches[0]['id']
        elif len(matches) > 1:
            raise ValueError(f'Row {number} matches multiple existing dealers')
        elif source_id:
            ident = source_id
        else:
            digest = hashlib.sha256('\0'.join(key(name, city)).encode('utf-8')).hexdigest()[:16]
            ident = 'candidate-' + digest
        if ident in used:
            raise ValueError(f'Row {number} maps to a duplicate dealer ID')
        used.add(ident)
        result.append({'id': ident, 'name': name, 'city': city})
        assignments[ident] = manager
    if not result or len(result) < len(old) * 0.9:
        raise ValueError('Too many dealers disappeared; refusing to overwrite data')
    missing_candidates = [d['id'] for d in old if d['id'].startswith('candidate-') and d['id'] not in used]
    if missing_candidates:
        raise ValueError('A dealer without a stable sheet ID disappeared or changed name/city; review required')
    return result, assignments


def main():
    dealers, assignments = prepare(get_rows(), read_current())
    date = datetime.now(timezone(timedelta(hours=3))).strftime('%d.%m.%Y')
    assignment_text = ('/* Дилеры и закрепление менеджеров из Google Sheets; обновлено ' + date + '. */\n'
                       'window.UMO_DEALERS_UPDATED = ' + json.dumps(date) + ';\n'
                       'window.UMO_DEALERS = Object.freeze(' + json.dumps(dealers, ensure_ascii=False, indent=2) + ');\n'
                       'window.UMO_DEALER_ASSIGNMENTS = Object.freeze(' + json.dumps(assignments, ensure_ascii=False, indent=2) + ');\n')
    ASSIGNMENTS_PATH.write_text(assignment_text, encoding='utf-8', newline='\n')
    print(f'Synchronised {len(dealers)} dealers')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Dealer synchronisation failed: {exc}', file=sys.stderr)
        sys.exit(1)

