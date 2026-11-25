import math

from scipy.integrate import solve_ivp


STATES = (
    "Время испарения",
    "Время ликвидации",
    "Площадь заражения",
    "Время подхода облака",
    "Пострадавшие от первичного облака",
    "Пострадавшие от вторичного облака",
    "Госпитализированные",
    "Поражённая техника",
    "Растворы для обеззараживания",
    "Силы и средства спасателей",
    "Эффективность оповещения",
)

FACTORS = (
    "Масштаб выброса",
    "Персонал на объекте",
    "Скорость ветра",
    "Температура воздуха",
    "Время до начала оповещения",
    "Численность населения",
    "Количество убежищ",
)

# fᵢ⁺ and fᵢ⁻ are named as in table 1. Signs describe their effect on Xᵢ.
TERMS = (
    ("f1+", 1, "+", "X₂ · F₁⁰·⁸", 0.32),
    ("f1−", 1, "−", "X₉ · X₁₀ / (F₃ · F₄)", 0.14),
    ("f2+", 2, "+", "X₃ · X₇ · X₈ · F₁⁰·⁸ / F₅", 0.45),
    ("f2−", 2, "−", "X₉ · X₁₀", 0.38),
    ("f3+", 3, "−", "F₁⁰·⁸ · F₃ · F₄ / X₁²·⁹", 0.18),
    ("f4+", 4, "+", "X₁", 0.47),
    ("f4−", 4, "−", "F₁⁰·⁸ · F₃ · F₄", 0.31),
    ("f5+", 5, "+", "F₂ / X₁²·¹", 0.31),
    ("f6+", 6, "+", "X₂ · F₅ · F₆", 0.79),
    ("f6−", 6, "−", "X₄ / (X₁₀ · X₁₁ · F₇)", 0.12),
    ("f7+", 7, "+", "(X₅ + X₆)⁰·⁶ · X₁₀", 0.62),
    ("f8+", 8, "+", "X₃", 0.50),
    ("f8−", 8, "−", "X₉ · X₁₀", 0.30),
    ("f9+", 9, "+", "(X₃ · X₈)⁰·²", 0.52),
    ("f10+", 10, "+", "√(X₃ · F₆)", 0.85),
    ("f11+", 11, "+", "X₁₀ · F₇ / F₆", 0.76),
    ("f11−", 11, "−", "1 / F₅", 0.10),
)

INITIAL = [0.56, 0.52, 0.43, 0.27, 0.10, 0.08, 0.0, 0.12, 0.14, 0.30, 0.40]
BASE_FACTORS = [
    [0.46, 0.46],
    [0.35, 0.35],
    [0.32, 0.60],
    [0.46, 0.46],
    [0.20, 0.20],
    [0.66, 0.66],
    [0.62, 0.62],
]

MODEL = {
    "states": STATES,
    "factors": FACTORS,
    "terms": [
        {"id": name, "state": state, "sign": sign, "expression": expression, "value": value}
        for name, state, sign, expression, value in TERMS
    ],
    "presets": {
        "early": {
            "initial": INITIAL,
            "factors": BASE_FACTORS,
        },
        "late": {
            "initial": INITIAL,
            "factors": BASE_FACTORS[:4] + [[0.70, 0.70]] + BASE_FACTORS[5:],
        },
    },
}


def numbers(values, size, upper, label):
    if not isinstance(values, list) or len(values) != size:
        raise ValueError(f"{label} — ожидается {size} значений.")
    for value in values:
        if type(value) not in (int, float) or not 0 <= value <= upper:
            raise ValueError(f"{label} — используйте числа от 0 до {upper}.")
    return values


def guarded(value):
    # Keep the denominator nonzero for normalized values at the edge of the scale.
    return max(0.1, value)


def solve(data):
    if not isinstance(data, dict):
        raise ValueError("Передайте параметры сценария.")

    initial = numbers(data.get("initial"), len(STATES), 1, "Начальные условия")
    factors = data.get("factors")
    if not isinstance(factors, list) or len(factors) != len(FACTORS):
        raise ValueError("Укажите по два значения для каждого из семи факторов.")
    factors = [
        numbers(profile, 2, 1, f"Фактор F{index}")
        for index, profile in enumerate(factors, start=1)
    ]
    coefficients = numbers(data.get("coefficients"), len(TERMS), 2, "Коэффициенты")

    def factor_values(time):
        return [start + (end - start) * time for start, end in factors]

    def rates(time, state):
        x1, x2, x3, x4, x5, x6, x7, x8, x9, x10, x11 = state.clip(0, 1)
        f1, f2, f3, f4, f5, f6, f7 = factor_values(time)
        release = f1**0.8
        influences = (
            x2 * release,
            x9 * x10 / guarded(f3 * f4),
            x3 * x7 * x8 * release / guarded(f5),
            x9 * x10,
            release * f3 * f4 / guarded(x1)**2.9,
            x1,
            release * f3 * f4,
            f2 / guarded(x1)**2.1,
            x2 * f5 * f6,
            x4 / guarded(x10 * x11 * f7),
            (x5 + x6)**0.6 * x10,
            x3,
            x9 * x10,
            (x3 * x8)**0.2,
            math.sqrt(x3 * f6),
            x10 * f7 / guarded(f6),
            1 / guarded(f5),
        )
        derivative = [0.0] * len(STATES)
        for (_, number, sign, _, _), coefficient, influence in zip(TERMS, coefficients, influences):
            index = number - 1
            magnitude = coefficient * influence
            if sign == "+":
                derivative[index] += magnitude * (1 - state[index])
            else:
                derivative[index] -= magnitude * state[index]
        return derivative

    times = [index / 100 for index in range(101)]
    solution = solve_ivp(rates, (0, 1), initial, t_eval=times, rtol=1e-6, atol=1e-8)
    if not solution.success:
        raise RuntimeError("Не удалось завершить расчёт с этими параметрами.")

    values = solution.y.clip(0, 1)
    return {
        "times": times,
        "states": values.tolist(),
        "factors": [list(series) for series in zip(*(factor_values(time) for time in times))],
        "quarters": [
            {"time": times[index], "values": values[:, index].tolist()}
            for index in (25, 50, 75, 100)
        ],
    }
