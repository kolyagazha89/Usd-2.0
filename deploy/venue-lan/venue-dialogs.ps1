#requires -Version 5.1
# Windows built-in dialogs; no downloads and no secrets in command arguments.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
function Show-VenueMessage([string]$Text){
 [System.Windows.Forms.MessageBox]::Show($Text,'USD — Офлайн-сервер','OK','Information')|Out-Null
}
function Confirm-VenueAction([string]$Text){
 return ([System.Windows.Forms.MessageBox]::Show($Text,'USD — Подтверждение','YesNo','Question') -eq 'Yes')
}
function Select-VenueOption([string]$Title,[string]$Text,[object[]]$Options){
 $form=New-Object System.Windows.Forms.Form
 $form.Text=$Title;$form.Size=New-Object System.Drawing.Size(680,330)
 $form.StartPosition='CenterScreen';$form.Font=New-Object System.Drawing.Font('Segoe UI',12)
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
 try{
  if($form.ShowDialog() -ne 'OK'){throw 'Действие отменено. Сохранённые данные не удалены.'}
  return [string]$list.SelectedItem.Value
 }finally{$form.Dispose()}
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
  'Скопируйте отпечаток из админки USD: Офлайн-сервер → Подготовка файла настоящего этапа. Не берите его из файла этапа.',
  'USD — Доверенный ключ','')
}
