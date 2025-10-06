#!/bin/bash
# Скрипт для удаления файлов из Git индекса

# Удаляем node_modules из git (но оставляем на диске)
git rm -r --cached node_modules

# Удаляем тестовые выходные файлы из git
git rm --cached jsonplaceholder-typicode-com.html
git rm -r --cached jsonplaceholder-typicode-com_files/

echo "Файлы удалены из git индекса. Теперь выполните:"
echo "git commit -m 'Remove node_modules and test output files from repository'"
echo "git push"

