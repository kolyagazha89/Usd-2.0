import openpyxl,json,time
targets=["квир","kvir","каргопол","kargopol","карец","karec","карек","кашап","kashap","кияк","kiyak","косолап","kosolap","краснов","krasnov","низафар","nizafar","усоль","usol","яквен","yakven","яковен","yakoven"]
out=[]
for fn in ["USD _ Регистрация.xlsx","USD _ Результаты.xlsx"]:
    wb=openpyxl.load_workbook(fn,data_only=True,read_only=True)
    for ws in wb.worksheets:
        for i,row in enumerate(ws.iter_rows(values_only=True),1):
            for j,val in enumerate(row):
                if val is None: continue
                s=str(val); low=s.lower()
                if any(t in low for t in targets):
                    out.append({"file":fn,"sheet":ws.title,"row":i,"col":j+1,"value":s})
print(json.dumps(out,ensure_ascii=False,separators=(",",":")),flush=True)
time.sleep(3600)
