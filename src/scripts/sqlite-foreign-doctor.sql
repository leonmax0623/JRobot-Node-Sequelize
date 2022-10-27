-- "лечит" данные в базе, удаляет ошибочные foreignKey связи
update replicas set sessionId = null where sessionId not in (select id from sessions);
update sessions set userId = null where userId not in (select id from users);
update sessions set scriptId = null where scriptId not in (select id from scripts);
update sessions set courseId = null where courseId not in (select id from courses);
update coursesteps set courseId = null where courseId not in (select id from courses);