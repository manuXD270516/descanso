"""Validación estática de los archivos del spike de 010 (RFC 5545 + reglas de la spec).

Uso: python specs/010-horario-recordatorios/spike/validate-ics.py spike-v1.ics spike-v2.ics

Comprueba con la librería `icalendar` (parseo estricto de cada línea) y con reglas propias:
- CRLF en todas las líneas y plegado a <= 75 octetos (RFC 5545 §3.1);
- VCALENDAR con VERSION:2.0 y PRODID (§3.6);
- cada VEVENT con UID, DTSTAMP (UTC) y DTSTART en hora flotante (sin TZID ni Z: hora de pared);
- RRULE semanal con BYDAY; VALARM DISPLAY con TRIGGER negativo y DESCRIPTION (§3.6.6);
- sin datos de salud (lista mínima de términos);
- entre v1 y v2: mismos UID (no se duplica), SEQUENCE mayor y días cancelados con STATUS:CANCELLED.
"""
import re
import sys

from icalendar import Calendar

FORBIDDEN = re.compile(r'horas dormidas|duraci[oó]n|calidad|nota|m[eé]trica|siesta|insomnio', re.I)


def check(path):
    raw = open(path, 'rb').read()
    errors = []
    lines = raw.split(b'\r\n')
    if lines[-1] != b'':
        errors.append('no termina en CRLF')
    for i, line in enumerate(lines[:-1], 1):
        if b'\n' in line or b'\r' in line:
            errors.append(f'línea {i}: salto de línea sin CRLF')
        if len(line) > 75:
            errors.append(f'línea {i}: {len(line)} octetos (> 75)')
    cal = Calendar.from_ical(raw)  # lanza si una línea es inválida
    if str(cal.get('VERSION')) != '2.0' or not cal.get('PRODID'):
        errors.append('falta VERSION:2.0 o PRODID')
    events = {}
    for ev in cal.walk('VEVENT'):
        uid = str(ev.get('UID'))
        for prop in ('UID', 'DTSTAMP', 'DTSTART', 'SEQUENCE'):
            if ev.get(prop) is None:
                errors.append(f'{uid}: falta {prop}')
        start = ev.decoded('DTSTART')
        if getattr(start, 'tzinfo', None) is not None:
            errors.append(f'{uid}: DTSTART no es hora flotante')
        if ev.decoded('DTSTAMP').tzinfo is None:
            errors.append(f'{uid}: DTSTAMP debe ir en UTC')
        rrule = ev.get('RRULE')
        if not rrule or rrule.get('FREQ') != ['WEEKLY'] or not rrule.get('BYDAY'):
            errors.append(f'{uid}: RRULE semanal con BYDAY')
        status = str(ev.get('STATUS', 'CONFIRMED'))
        alarms = ev.walk('VALARM')
        if status != 'CANCELLED':
            if len(alarms) != 1:
                errors.append(f'{uid}: debe tener exactamente 1 VALARM')
            for a in alarms:
                if str(a.get('ACTION')) != 'DISPLAY' or not a.get('DESCRIPTION'):
                    errors.append(f'{uid}: VALARM DISPLAY con DESCRIPTION')
                if a.decoded('TRIGGER').total_seconds() >= 0:
                    errors.append(f'{uid}: TRIGGER debe ser negativo (antes del evento)')
        text = ' '.join(str(ev.get(p, '')) for p in ('SUMMARY', 'DESCRIPTION')) + ' '.join(str(a.get('DESCRIPTION', '')) for a in alarms)
        if FORBIDDEN.search(text):
            errors.append(f'{uid}: posible dato de salud en el texto')
        events[uid] = (int(ev.get('SEQUENCE')), status, start)
    return events, errors


def main(paths):
    results = [check(p) for p in paths]
    ok = True
    for p, (events, errors) in zip(paths, results):
        print(f'{p}: {len(events)} eventos, {"válido" if not errors else "con errores"}')
        for e in errors:
            ok = False
            print(f'  ✘ {e}')
    if len(results) == 2:
        (v1, _), (v2, _) = results
        same = set(v1) == set(v2)
        seq = all(v2[u][0] > v1[u][0] for u in v1 if u in v2)
        cancelled = [u for u, (_, s, _) in v2.items() if s == 'CANCELLED']
        print(f'v1→v2: mismos UID={same}, SEQUENCE creciente={seq}, cancelados={cancelled}, eventos {len(v1)}→{len(v2)}')
        ok = ok and same and seq and len(v2) == len(v1)
    print('RESULTADO:', 'OK' if ok else 'FALLA')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
