FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir openpyxl
COPY . /app
CMD ["python","tmp/reader.py"]
