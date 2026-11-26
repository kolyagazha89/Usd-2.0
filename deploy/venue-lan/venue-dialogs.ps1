#requires -Version 5.1
# Windows built-in dialogs; no downloads and no secrets in command arguments.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
function Show-VenueMessage([string]$Text){
 [System.Windows.Forms.MessageBox]::Show($Text,'USD — Офлайн-сервер','OK','Information')|Out-Null
}
function Confirm-VenueAction([string]$Text){
 $owner=New-Object System.Windows.Forms.Form
 $owner.TopMost=$true;$owner.StartPosition='CenterScreen';$owner.Size=New-Object System.Drawing.Size(1,1)
 $owner.ShowInTaskbar=$false;$owner.Opacity=0
 try{
  $owner.Show()
  return ([System.Windows.Forms.MessageBox]::Show($owner,$Text,'USD — Подтверждение','YesNo','Question') -eq 'Yes')
 }finally{$owner.Dispose()}
}
function Select-VenueOption([string]$Title,[string]$Text,[object[]]$Options){
 $form=New-Object System.Windows.Forms.Form
 $form.Text=$Title;$form.Size=New-Object System.Drawing.Size(680,330)
 $form.StartPosition='CenterScreen';$form.TopMost=$true;$form.ShowInTaskbar=$true;$form.Font=New-Object System.Drawing.Font('Segoe UI',12)
 $form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false
 $label=New-Object System.Windows.Forms.Label
 $label.Text=$Text;$label.Location=New-Object System.Drawing.Point(20,15)
 $label.Size=New-Object System.Drawing.Size(620,75)
 $list=New-Object System.Windows.Forms.ListBox
 $list.Location=New-Object System.Drawing.Point(20,95);$list.Size=New-Object System.Drawing.Size(620,100)
 $list.DisplayMember='Label'
 foreach($option in $Options){$list.Items.Add($option)|Out-Null}
 $list.SelectedIndex=0
 $ok=New-Object System.Windows.Forms.Button
 $ok.Text='Продолжить';$ok.Location=New-Object System.Drawing.Point(350,220);$ok.Size=New-Object System.Drawing.Size(140,44)
 $ok.DialogResult='OK'
 $cancel=New-Object System.Windows.Forms.Button
 $cancel.Text='Отмена';$cancel.Location=New-Object System.Drawing.Point(500,220);$cancel.Size=New-Object System.Drawing.Size(140,44)
 $cancel.DialogResult='Cancel'
 $form.Controls.AddRange(@($label,$list,$ok,$cancel));$form.AcceptButton=$ok;$form.CancelButton=$cancel
 $timer=New-Object System.Windows.Forms.Timer
 $timer.Interval=120000
 $timer.Add_Tick({$form.DialogResult='Cancel';$form.Close()}.GetNewClosure())
 $form.Add_Shown({$form.Activate();$timer.Start()}.GetNewClosure())
 try{
  if($form.ShowDialog() -ne 'OK'){throw 'Действие отменено. Сохранённые данные не удалены.'}
  return [string]$list.SelectedItem.Value
 }finally{$timer.Stop();$timer.Dispose();$form.Dispose()}
}
function Select-VenueFile([string]$Title,[string]$Filter){
 $dialog=New-Object System.Windows.Forms.OpenFileDialog
 $dialog.Title=$Title;$dialog.Filter=$Filter;$dialog.CheckFileExists=$true;$dialog.Multiselect=$false
 try{
  if($dialog.ShowDialog() -ne 'OK'){throw 'Файл не выбран. Можно повторить установку.'}
  return $dialog.FileName
 }finally{$dialog.Dispose()}
}
function Read-VenueFingerprint {
 Add-Type -AssemblyName Microsoft.VisualBasic
 return [Microsoft.VisualBasic.Interaction]::InputBox(
  'Скопируйте отпечаток из админки USD: Офлайн-сервер → Пакет этапа. Не берите его из файла этапа.',
  'USD — Доверенный ключ','')
}
