import os

import psycopg2
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()

    database_url = os.getenv("DATABASE_URL")
    user = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD")
    host = os.getenv("DB_HOST")
    port = os.getenv("DB_PORT")
    dbname = os.getenv("DB_NAME")

    try:
        if database_url:
            connection = psycopg2.connect(database_url)
        else:
            connection = psycopg2.connect(
                user=user,
                password=password,
                host=host,
                port=port,
                dbname=dbname,
            )

        print("Connection successful!")

        cursor = connection.cursor()
        cursor.execute("SELECT NOW();")
        result = cursor.fetchone()
        print("Current Time:", result)

        cursor.close()
        connection.close()
        print("Connection closed.")
    except Exception as exc:
        print(f"Failed to connect: {exc}")


if __name__ == "__main__":
    main()
