import unittest
import sync_dealers as sync


def row(ident='', city='', name='', manager=''):
    result = [''] * 17
    for index, value in zip((1, 3, 14, 16), (ident, city, name, manager)):
        result[index] = value
    return result


HEADER = [''] * 17
for index, value in sync.HEADERS.items():
    HEADER[index] = value


class DealerSyncTest(unittest.TestCase):
    def setUp(self):
        self.old = [
            {'id': 'U-1', 'city': 'Город', 'name': 'Дилер'},
            {'id': 'candidate-77', 'city': 'Другой город', 'name': 'Другой дилер'},
        ]
        self.rows = [HEADER,
                     row('U-1', 'Город', 'Новое название', 'Менеджер'),
                     row('', 'Другой город', 'Другой дилер', 'Менеджер')]

    def test_preserves_regular_id_and_candidate_id_even_if_source_adds_id(self):
        self.rows[2][1] = 'U-2'
        dealers, assignments = sync.prepare(self.rows, self.old)
        self.assertEqual([d['id'] for d in dealers], ['U-1', 'candidate-77'])
        self.assertEqual(assignments['candidate-77'], 'Менеджер')

    def test_refuses_incomplete_or_duplicate_rows(self):
        self.rows[2][16] = ''
        with self.assertRaises(ValueError):
            sync.prepare(self.rows, self.old)
        self.rows[2][16] = 'Менеджер'
        self.rows[2][1] = 'U-1'
        with self.assertRaises(ValueError):
            sync.prepare(self.rows, self.old)

    def test_refuses_candidate_identity_loss_and_changed_headers(self):
        self.rows[2][14] = 'Переименован'
        with self.assertRaises(ValueError):
            sync.prepare(self.rows, self.old)
        self.rows[0] = row('Other ID', 'Город', 'Маркетинговое название', 'Региональный менеджер')
        with self.assertRaises(ValueError):
            sync.prepare(self.rows, self.old)

    def test_new_dealer_without_source_id_is_stable(self):
        self.rows.append(row('', 'Город', 'Новый дилер', 'Менеджер'))
        first, _ = sync.prepare(self.rows, self.old)
        second, _ = sync.prepare(self.rows, self.old)
        self.assertEqual(first[-1]['id'], second[-1]['id'])
        self.assertTrue(first[-1]['id'].startswith('candidate-'))


if __name__ == '__main__':
    unittest.main()

