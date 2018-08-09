#
#
#

finalise_fact_find_async


p_hash varchar

<?

	updated_by varchar := 'A'; /* adviser */
	x integer;

?><%

	update client_fact_finds t
	set completed_on = current_timestamp
	where t.hash_string = p_hash
	;

	x := (select client_id from client_fact_finds where hash_string = p_hash);

	if x > 0 then

		insert into notifications (staff_id, notes, created_on)
		values (31, 'Fact find completed for ' || (select first_name || ' ' || last_name from people where id = x), current_timestamp);

	end if;

	return pogo_return_OK('{ "status": "success", "message": "Done." }');

%>
