-- The line of an invoice becomes two columns. What it printed as its
-- description is its item: what the invoice is for, which the clients of
-- the API offer as a list of the kinds of cleaning, with room for anything
-- else. The description is now what may be written next to the item, and
-- nothing unless the owner writes it.
ALTER TABLE invoices RENAME COLUMN description TO item;

ALTER TABLE invoices ADD COLUMN description text;
