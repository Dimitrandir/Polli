# Bulgarian dates as the salon writes them: 13.10.2026, 15:05 (Django has "3:05 след обяд").
DATE_FORMAT = "d.m.Y"
TIME_FORMAT = "H:i"
DATETIME_FORMAT = "d.m.Y, H:i"
SHORT_DATE_FORMAT = "d.m.Y"
SHORT_DATETIME_FORMAT = "d.m.Y, H:i"
MONTH_DAY_FORMAT = "j F"
YEAR_MONTH_FORMAT = "F Y"
FIRST_DAY_OF_WEEK = 1  # Monday
DATE_INPUT_FORMATS = ["%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d"]
TIME_INPUT_FORMATS = ["%H:%M", "%H:%M:%S"]
DATETIME_INPUT_FORMATS = ["%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"]
