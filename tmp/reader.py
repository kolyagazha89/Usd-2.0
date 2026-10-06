import openpyxl,json,time
wb=openpyxl.load_workbook("USD _ Регистрация.xlsx",data_only=True,read_only=True)
out={}
for ws in wb.worksheets:
    rows=[]
    for i,row in enumerate(ws.iter_rows(values_only=True),1):
        if i==1: continue
        vals=list(row)
        if vals and vals[1]:
            rows.append({"row":i,"name":str(vals[1]),"car":str(vals[2] or ""),"reg":str(vals[3] or ""),"email":str(vals[11] or "")})
    out[ws.title]=rows
print(json.dumps(out,ensure_ascii=False,separators=(",",":")),flush=True)
time.sleep(3600)
