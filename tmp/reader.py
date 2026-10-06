import openpyxl,json,time
out={}
for fn,key in [("USD _ Регистрация.xlsx","registration"),("USD _ Результаты.xlsx","results")]:
    wb=openpyxl.load_workbook(fn,data_only=True,read_only=True)
    out[key]={ws.title:[list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}
print(json.dumps(out,ensure_ascii=False,default=str,separators=(",",":")),flush=True)
time.sleep(3600)
