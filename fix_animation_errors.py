import re

RES = 'JUN06LeefySpawners RES'

fixes = {
    f'{RES}/animations/chickenstill.animation.json': [
        ('variable.wing_flap', '0'),
    ],
    f'{RES}/animations/guardianstill.animation.json': [
        ('variable.spike_extension', '0'),
        ('variable.spike_shake', '0'),
        ('variable.tail_base_angle', '0'),
    ],
    f'{RES}/animations/wither_boss.animation.json': [
        (r'query\.head_x_rotation\([12]\)', '0'),
        (r'query\.head_y_rotation\([12]\)', '0'),
    ],
}

for path, replacements in fixes.items():
    with open(path) as f:
        content = f.read()
    for pattern, value in replacements:
        content = re.sub(pattern, value, content)
    with open(path, 'w') as f:
        f.write(content)
    print(f'Silenced: {path}')

print('Done.')
